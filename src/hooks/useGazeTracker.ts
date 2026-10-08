/**
 * Hook: useGazeTracker
 * Encapsulates WebGazer initialization, smoothing, calibration, and fallback states.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TrackingStatus, GazeCoordinates } from '../types';
import { loadWebGazerScript, cleanupWebGazerDOM } from '../services/webgazerLoader';

interface UseGazeTrackerReturn {
  trackingStatus: TrackingStatus;
  errorMessage: string | null;
  gazeCoords: GazeCoordinates;
  showGazeDot: boolean;
  setShowGazeDot: (show: boolean) => void;
  isDemoSimulation: boolean;
  setIsDemoSimulation: (demo: boolean) => void;
  startTracking: () => Promise<boolean>;
  stopTracking: () => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  startCalibration: () => void;
  startValidation: () => void;
  finishCalibration: () => void;
  cancelCalibration: () => void;
  recordCalibrationPoint: (x: number, y: number) => void;
  setCameraPreviewVisible: (visible: boolean) => void;
  setManualGazeCoords: (x: number, y: number) => void;
}

export function useGazeTracker(): UseGazeTrackerReturn {
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('not_started');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showGazeDot, setShowGazeDot] = useState<boolean>(true);
  const [isDemoSimulation, setIsDemoSimulation] = useState<boolean>(false);
  const [gazeCoords, setGazeCoords] = useState<GazeCoordinates>({
    x: 0,
    y: 0,
    timestamp: 0,
    isValid: false,
  });

  const lastCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTrackingActiveRef = useRef<boolean>(false);
  const isDemoRef = useRef<boolean>(false);
  const trackingStatusRef = useRef<TrackingStatus>('not_started');
  const calibrationReturnStatusRef = useRef<TrackingStatus>('not_started');
  const gazeFreshnessTimeoutRef = useRef<number | null>(null);

  const resetCalibrationModel = useCallback(() => {
    const webgazer = window.webgazer;
    if (!webgazer) return;

    try {
      // Calibration belongs to the current participant/session. Reusing a
      // stored model can mix old posture, lighting, or another user's data.
      if (typeof webgazer.saveDataAcrossSessions === 'function') {
        webgazer.saveDataAcrossSessions(false);
      }
      if (typeof webgazer.clearData === 'function') {
        webgazer.clearData();
      }
      if (typeof webgazer.setRegression === 'function') {
        webgazer.setRegression('ridge');
      }
      if (typeof webgazer.applyKalmanFilter === 'function') {
        webgazer.applyKalmanFilter(true);
      }
      if (webgazer.params) {
        webgazer.params.dataTimestep = 50;
      }
    } catch (error) {
      console.warn('Unable to reset WebGazer calibration model:', error);
    }
  }, []);

  useEffect(() => {
    isDemoRef.current = isDemoSimulation;
  }, [isDemoSimulation]);

  useEffect(() => {
    trackingStatusRef.current = trackingStatus;
  }, [trackingStatus]);

  // Exponential moving average filter coefficient
  const SMOOTHING_FACTOR = 0.35; // 35% new, 65% old for steady dwell stabilization

  const updateGaze = useCallback((rawX: number, rawY: number) => {
    if (isNaN(rawX) || isNaN(rawY)) return;

    // Boundary check within reasonable viewport limits
    if (rawX < -100 || rawX > window.innerWidth + 100 || rawY < -100 || rawY > window.innerHeight + 100) {
      return;
    }

    const prev = lastCoordsRef.current;
    let smoothX = rawX;
    let smoothY = rawY;

    if (prev.x !== 0 || prev.y !== 0) {
      smoothX = prev.x * (1 - SMOOTHING_FACTOR) + rawX * SMOOTHING_FACTOR;
      smoothY = prev.y * (1 - SMOOTHING_FACTOR) + rawY * SMOOTHING_FACTOR;
    }

    lastCoordsRef.current = { x: smoothX, y: smoothY };

    if (gazeFreshnessTimeoutRef.current !== null) {
      window.clearTimeout(gazeFreshnessTimeoutRef.current);
    }

    setGazeCoords({
      x: Math.round(smoothX),
      y: Math.round(smoothY),
      timestamp: performance.now(),
      isValid: true,
    });

    gazeFreshnessTimeoutRef.current = window.setTimeout(() => {
      setGazeCoords((current) => ({ ...current, isValid: false }));
      lastCoordsRef.current = { x: 0, y: 0 };
      gazeFreshnessTimeoutRef.current = null;
    }, 700);
  }, []);

  const setManualGazeCoords = useCallback((x: number, y: number) => {
    lastCoordsRef.current = { x, y };
    setGazeCoords({
      x: Math.round(x),
      y: Math.round(y),
      timestamp: performance.now(),
      isValid: true,
    });
  }, []);

  const setCameraPreviewVisible = useCallback((visible: boolean) => {
    const videoContainer = document.getElementById('webgazerVideoContainer');
    if (!videoContainer) return;

    videoContainer.style.display = visible ? 'block' : 'none';
    videoContainer.style.position = 'fixed';
    videoContainer.style.top = '20px';
    videoContainer.style.right = '20px';
    videoContainer.style.bottom = 'auto';
    videoContainer.style.left = 'auto';
    videoContainer.style.width = '180px';
    videoContainer.style.height = '135px';
    videoContainer.style.zIndex = '70';
    videoContainer.style.borderRadius = '10px';
    videoContainer.style.overflow = 'hidden';
    videoContainer.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.28)';
    videoContainer.style.border = '2px solid rgba(255, 255, 255, 0.9)';

    // WebGazer keeps its child video at 320x240 by default. Match every
    // preview layer to the resized container so the feed is not cropped.
    ['webgazerVideoFeed', 'webgazerVideoCanvas', 'webgazerFaceOverlay', 'webgazerFaceFeedbackBox'].forEach((id) => {
      const layer = document.getElementById(id) as HTMLElement | null;
      if (!layer) return;

      layer.style.position = 'absolute';
      layer.style.top = '0';
      layer.style.left = '0';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.maxWidth = 'none';
      layer.style.maxHeight = 'none';
    });

    const video = document.getElementById('webgazerVideoFeed') as HTMLVideoElement | null;
    if (video) {
      video.style.objectFit = 'cover';
      video.style.objectPosition = 'center';
    }
  }, []);

  const startTracking = useCallback(async () => {
    setErrorMessage(null);
    calibrationReturnStatusRef.current = 'not_started';
    trackingStatusRef.current = 'checking_camera';
    setTrackingStatus('checking_camera');

    try {
      // 1. Request camera access explicitly to verify user permissions
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support webcam media devices.');
      }

      const webgazer = await loadWebGazerScript();

      // Configure WebGazer
      resetCalibrationModel();
      webgazer.params.showVideo = true;
      webgazer.params.showFaceOverlay = false;
      webgazer.params.showFaceFeedbackBox = false;
      webgazer.showPredictionPoints(false); // We render our own clean reticle

      webgazer.setGazeListener((data: any) => {
        const status = trackingStatusRef.current;
        if (!isTrackingActiveRef.current && status !== 'calibrating' && status !== 'validating') {
          return;
        }
        if (data) {
          updateGaze(data.x, data.y);
        }
      });

      await Promise.race([
        webgazer.begin(),
        new Promise((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('Camera startup timed out. Check the browser camera permission and try again.'));
          }, 20000);
        }),
      ]);

      isTrackingActiveRef.current = true;
      trackingStatusRef.current = 'calibrating';
      setTrackingStatus('calibrating');
      setCameraPreviewVisible(false);
      return true;
    } catch (err: any) {
      console.error('Failed to start WebGazer:', err);
      let msg = 'Failed to access camera or initialize gaze tracking.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in browser site settings.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
      trackingStatusRef.current = 'error';
      setTrackingStatus('error');
      cleanupWebGazerDOM();
      return false;
    }
  }, [resetCalibrationModel, setCameraPreviewVisible, updateGaze]);

  const stopTracking = useCallback(() => {
    isTrackingActiveRef.current = false;
    trackingStatusRef.current = 'not_started';
    setCameraPreviewVisible(false);
    cleanupWebGazerDOM();
    setTrackingStatus('not_started');
    setErrorMessage(null);
    setGazeCoords({ x: 0, y: 0, timestamp: 0, isValid: false });
    lastCoordsRef.current = { x: 0, y: 0 };
  }, [setCameraPreviewVisible]);

  const pauseTracking = useCallback(() => {
    if (window.webgazer && typeof window.webgazer.pause === 'function') {
      window.webgazer.pause();
    }
    isTrackingActiveRef.current = false;
    trackingStatusRef.current = 'paused';
    setTrackingStatus('paused');
  }, []);

  const resumeTracking = useCallback(() => {
    if (window.webgazer && typeof window.webgazer.resume === 'function') {
      window.webgazer.resume();
    }
    isTrackingActiveRef.current = true;
    trackingStatusRef.current = 'tracking';
    setTrackingStatus('tracking');
  }, []);

  const startCalibration = useCallback(() => {
    const currentStatus = trackingStatusRef.current;
    if (currentStatus !== 'calibrating' && currentStatus !== 'validating') {
      calibrationReturnStatusRef.current = currentStatus === 'tracking' ? 'tracking' : 'not_started';
    }
    resetCalibrationModel();
    trackingStatusRef.current = 'calibrating';
    setTrackingStatus('calibrating');
  }, [resetCalibrationModel]);

  const startValidation = useCallback(() => {
    trackingStatusRef.current = 'validating';
    setTrackingStatus('validating');
  }, []);

  const finishCalibration = useCallback(() => {
    setCameraPreviewVisible(false);
    trackingStatusRef.current = 'tracking';
    setTrackingStatus('tracking');
    isTrackingActiveRef.current = true;
  }, [setCameraPreviewVisible]);

  const cancelCalibration = useCallback(() => {
    setCameraPreviewVisible(false);
    if (calibrationReturnStatusRef.current === 'tracking') {
      trackingStatusRef.current = 'tracking';
      setTrackingStatus('tracking');
      isTrackingActiveRef.current = true;
      return;
    }

    isTrackingActiveRef.current = false;
    trackingStatusRef.current = 'not_started';
    setTrackingStatus('not_started');
    cleanupWebGazerDOM();
  }, [setCameraPreviewVisible]);

  const recordCalibrationPoint = useCallback((x: number, y: number) => {
    if (window.webgazer && typeof window.webgazer.recordScreenPosition === 'function') {
      try {
        window.webgazer.recordScreenPosition(x, y, 'click');
      } catch (e) {
        console.warn('WebGazer calibration click recording:', e);
      }
    }
  }, []);

  // Handle Demo Simulation mouse coordinates
  useEffect(() => {
    if (!isDemoSimulation) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDemoRef.current) return;
      updateGaze(e.clientX, e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDemoSimulation, updateGaze]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (gazeFreshnessTimeoutRef.current !== null) {
        window.clearTimeout(gazeFreshnessTimeoutRef.current);
      }
      cleanupWebGazerDOM();
    };
  }, []);

  return {
    trackingStatus,
    errorMessage,
    gazeCoords,
    showGazeDot,
    setShowGazeDot,
    isDemoSimulation,
    setIsDemoSimulation,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    startCalibration,
    startValidation,
    finishCalibration,
    cancelCalibration,
    recordCalibrationPoint,
    setCameraPreviewVisible,
    setManualGazeCoords,
  };
}
