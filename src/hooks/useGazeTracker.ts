/**
 * Hook: useGazeTracker
 * Encapsulates WebGazer initialization, smoothing, calibration, and fallback states.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CameraPreviewAnchor,
  CalibrationPointRecordResult,
  FaceTrackingStatus,
  GazeStabilityStatus,
  TrackingStatus,
  GazeCoordinates,
} from '../types';
import { loadWebGazerScript, cleanupWebGazerDOM } from '../services/webgazerLoader';
import { CALIBRATION_CONFIG } from '../config/calibration';
import {
  logGazeDiagnostic,
  startGazeDiagnosticsSession,
} from '../utils/gazeDiagnostics';

/**
 * WebGazer normally learns from global mouse clicks and movements. That is
 * useful for its default mouse-assisted demos, but it would contaminate this
 * app's gaze-only calibration and experiment data.
 */
function disableWebGazerMouseCalibration(webgazer: any = window.webgazer) {
  if (webgazer && typeof webgazer.removeMouseEventListeners === 'function') {
    webgazer.removeMouseEventListeners();
  }
}

function getWebGazerCameraDetails() {
  const container = document.getElementById('webgazerVideoContainer') as HTMLElement | null;
  const video = document.getElementById('webgazerVideoFeed') as HTMLVideoElement | null;
  const stream = video?.srcObject as MediaStream | null;
  const videoTracks = stream?.getVideoTracks?.() ?? [];

  return {
    containerDisplay: container?.style.display ?? null,
    containerWidth: container?.getBoundingClientRect().width ?? null,
    containerHeight: container?.getBoundingClientRect().height ?? null,
    videoReadyState: video?.readyState ?? null,
    videoPaused: video?.paused ?? null,
    videoWidth: video?.videoWidth ?? null,
    videoHeight: video?.videoHeight ?? null,
    hasVideoStream: Boolean(stream),
    streamActive: stream?.active ?? null,
    videoTrackCount: videoTracks.length,
    videoTrackStates: videoTracks.map((track) => ({
      readyState: track.readyState,
      enabled: track.enabled,
      muted: track.muted,
      settings: track.getSettings(),
    })),
  };
}

function getWebGazerTrainingSampleCount(webgazer: any): number | null {
  const regression = webgazer?.getRegression?.()?.[0];
  const length = regression?.eyeFeaturesClicks?.length;
  return typeof length === 'number' ? length : null;
}

interface UseGazeTrackerReturn {
  trackingStatus: TrackingStatus;
  faceStatus: FaceTrackingStatus;
  gazeStability: GazeStabilityStatus;
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
  startLocalCalibration: () => void;
  startValidation: () => void;
  finishCalibration: () => void;
  cancelCalibration: () => void;
  recordCalibrationPoint: (x: number, y: number) => CalibrationPointRecordResult;
  setCameraPreviewVisible: (
    visible: boolean,
    showFaceGuide?: boolean,
    anchor?: CameraPreviewAnchor,
  ) => void;
}

export function useGazeTracker(): UseGazeTrackerReturn {
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('not_started');
  const [faceStatus, setFaceStatus] = useState<FaceTrackingStatus>('not_detected');
  const [gazeStability, setGazeStability] = useState<GazeStabilityStatus>('unavailable');
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
  const hasReceivedGazeRef = useRef<boolean>(false);
  const trackingStatusRef = useRef<TrackingStatus>('not_started');
  const calibrationReturnStatusRef = useRef<TrackingStatus>('not_started');
  const gazeFreshnessTimeoutRef = useRef<number | null>(null);
  const gazeStartupTimeoutRef = useRef<number | null>(null);
  const gazeHistoryRef = useRef<Array<{ x: number; y: number; timestamp: number }>>([]);
  const lastDiagnosticGazeLogRef = useRef(0);
  const lastNoDataDiagnosticLogRef = useRef(0);
  const lastGazeUpdateAtRef = useRef<number | null>(null);
  const webgazerCallbackCountRef = useRef(0);
  const trackerFrameStateRef = useRef('unknown');
  const latestEyeFeaturesAtRef = useRef<number | null>(null);
  const eyeFeatureFrameIdRef = useRef(0);
  const lastCalibrationAttemptFrameIdRef = useRef(0);
  const faceLandmarkHistoryRef = useRef<Array<{ x: number; y: number; timestamp: number }>>([]);
  const consecutiveNoFaceFramesRef = useRef(0);
  const consecutiveInvalidEyeFramesRef = useRef(0);
  const lastTrackerDiagnosticAtRef = useRef(0);
  const runtimeErrorCleanupRef = useRef<(() => void) | null>(null);
  const webGazerConsoleCleanupRef = useRef<(() => void) | null>(null);

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
        webgazer.params.dataTimestep = CALIBRATION_CONFIG.gaze.dataTimestepMs;
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
    logGazeDiagnostic('tracking_status_changed', { trackingStatus });
  }, [trackingStatus]);

  useEffect(() => {
    logGazeDiagnostic('face_status_changed', { faceStatus, source: 'camera_eye_landmarks' });
  }, [faceStatus]);

  useEffect(() => {
    logGazeDiagnostic('gaze_stability_changed', {
      gazeStability,
      source: 'screen_gaze_coordinates',
    });
  }, [gazeStability]);

  const updateGazeStability = useCallback((x: number, y: number, timestamp: number) => {
    const history = [
      ...gazeHistoryRef.current.filter(
        (sample) => timestamp - sample.timestamp <= CALIBRATION_CONFIG.faceStability.historyWindowMs,
      ),
      { x, y, timestamp },
    ];
    gazeHistoryRef.current = history.slice(-CALIBRATION_CONFIG.faceStability.maxHistorySamples);

    if (history.length < CALIBRATION_CONFIG.faceStability.minHistorySamples) {
      setGazeStability('warming_up');
      return { historyLength: history.length, maxDeviation: null, nextStatus: 'warming_up' as const };
    }

    const meanX = history.reduce((sum, sample) => sum + sample.x, 0) / history.length;
    const meanY = history.reduce((sum, sample) => sum + sample.y, 0) / history.length;
    const maxDeviation = Math.max(
      ...history.map((sample) => Math.hypot(sample.x - meanX, sample.y - meanY)),
    );

    const nextStatus = maxDeviation <= CALIBRATION_CONFIG.gazeStability.maxDeviationPx
      ? 'stable'
      : 'moving';
    setGazeStability(nextStatus);
    return { historyLength: history.length, maxDeviation, nextStatus };
  }, []);

  const updateFaceFeatureStatus = useCallback((result: any) => {
    const now = performance.now();
    let details: Record<string, unknown> = {};

    if (result === false) {
      trackerFrameStateRef.current = 'face_not_detected';
      latestEyeFeaturesAtRef.current = null;
      consecutiveNoFaceFramesRef.current += 1;
      consecutiveInvalidEyeFramesRef.current = 0;
      if (consecutiveNoFaceFramesRef.current >= 3) {
        faceLandmarkHistoryRef.current = [];
        setFaceStatus('not_detected');
      }
      details = { outcome: trackerFrameStateRef.current };
    } else if (!result) {
      trackerFrameStateRef.current = 'eye_patch_unavailable';
      latestEyeFeaturesAtRef.current = null;
      consecutiveInvalidEyeFramesRef.current += 1;
      consecutiveNoFaceFramesRef.current = 0;
      if (consecutiveInvalidEyeFramesRef.current >= 3) setFaceStatus('gaze_unavailable');
      details = { outcome: trackerFrameStateRef.current };
    } else {
      trackerFrameStateRef.current = 'eye_features_ready';
      latestEyeFeaturesAtRef.current = now;
      eyeFeatureFrameIdRef.current += 1;
      consecutiveNoFaceFramesRef.current = 0;
      consecutiveInvalidEyeFramesRef.current = 0;

      const left = result.left;
      const right = result.right;
      const x = (
        left.imagex + left.width / 2 + right.imagex + right.width / 2
      ) / 2;
      const y = (
        left.imagey + left.height / 2 + right.imagey + right.height / 2
      ) / 2;
      const history = [
        ...faceLandmarkHistoryRef.current.filter(
          (sample) => now - sample.timestamp <= CALIBRATION_CONFIG.faceStability.historyWindowMs,
        ),
        { x, y, timestamp: now },
      ].slice(-CALIBRATION_CONFIG.faceStability.maxHistorySamples);
      faceLandmarkHistoryRef.current = history;

      if (history.length < CALIBRATION_CONFIG.faceStability.minHistorySamples) {
        setFaceStatus('detected');
      } else {
        const meanX = history.reduce((sum, sample) => sum + sample.x, 0) / history.length;
        const meanY = history.reduce((sum, sample) => sum + sample.y, 0) / history.length;
        const maxDeviation = Math.max(
          ...history.map((sample) => Math.hypot(sample.x - meanX, sample.y - meanY)),
        );
        const nextStatus = maxDeviation <= CALIBRATION_CONFIG.faceStability.landmarkMaxDeviationPx
          ? 'stable'
          : 'moving';
        setFaceStatus(nextStatus);
        details = {
          outcome: trackerFrameStateRef.current,
          eyeFeatureFrameId: eyeFeatureFrameIdRef.current,
          faceCenterX: Math.round(x),
          faceCenterY: Math.round(y),
          historyLength: history.length,
          maxLandmarkDeviationPx: Math.round(maxDeviation * 100) / 100,
          faceStatus: nextStatus,
          leftEyePatch: { width: left.width, height: left.height },
          rightEyePatch: { width: right.width, height: right.height },
        };
      }
    }

    if (now - lastTrackerDiagnosticAtRef.current >= CALIBRATION_CONFIG.diagnostics.gazeLogIntervalMs) {
      logGazeDiagnostic('webgazer_tracker_frame', details);
      lastTrackerDiagnosticAtRef.current = now;
    }
  }, []);

  const updateGaze = useCallback((
    rawX: number,
    rawY: number,
    source: 'webgazer' | 'demo_mouse' = 'webgazer',
  ) => {
    if (isNaN(rawX) || isNaN(rawY)) {
      logGazeDiagnostic('gaze_rejected_invalid_coordinates', { source, rawX, rawY });
      return;
    }

    // Boundary check within reasonable viewport limits
    if (rawX < -100 || rawX > window.innerWidth + 100 || rawY < -100 || rawY > window.innerHeight + 100) {
      logGazeDiagnostic('gaze_rejected_out_of_bounds', {
        source,
        rawX,
        rawY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      return;
    }

    const prev = lastCoordsRef.current;
    let smoothX = rawX;
    let smoothY = rawY;
    const smoothingFactor = CALIBRATION_CONFIG.gaze.smoothingFactor;

    if (prev.x !== 0 || prev.y !== 0) {
      smoothX = prev.x * (1 - smoothingFactor) + rawX * smoothingFactor;
      smoothY = prev.y * (1 - smoothingFactor) + rawY * smoothingFactor;
    }

    lastCoordsRef.current = { x: smoothX, y: smoothY };
    hasReceivedGazeRef.current = true;
    if (gazeStartupTimeoutRef.current !== null) {
      window.clearTimeout(gazeStartupTimeoutRef.current);
      gazeStartupTimeoutRef.current = null;
    }
    const timestamp = performance.now();
    const gazeState = updateGazeStability(smoothX, smoothY, timestamp);
    lastGazeUpdateAtRef.current = timestamp;

    if (timestamp - lastDiagnosticGazeLogRef.current >= CALIBRATION_CONFIG.diagnostics.gazeLogIntervalMs) {
      logGazeDiagnostic('gaze_update', {
        source,
        rawX: Math.round(rawX),
        rawY: Math.round(rawY),
        smoothedX: Math.round(smoothX),
        smoothedY: Math.round(smoothY),
        historyLength: gazeState.historyLength,
        maxDeviation: gazeState.maxDeviation === null ? null : Math.round(gazeState.maxDeviation),
        gazeStability: gazeState.nextStatus,
      });
      lastDiagnosticGazeLogRef.current = timestamp;
    }

    if (gazeFreshnessTimeoutRef.current !== null) {
      window.clearTimeout(gazeFreshnessTimeoutRef.current);
    }

    setGazeCoords({
      x: Math.round(smoothX),
      y: Math.round(smoothY),
      timestamp,
      isValid: true,
    });

    gazeFreshnessTimeoutRef.current = window.setTimeout(() => {
      setGazeCoords((current) => ({ ...current, isValid: false }));
      lastCoordsRef.current = { x: 0, y: 0 };
      gazeHistoryRef.current = [];
      setGazeStability('unavailable');
      logGazeDiagnostic('gaze_signal_unavailable', {
        reason: 'freshness_timeout',
        timeoutMs: CALIBRATION_CONFIG.gaze.freshnessTimeoutMs,
        lastGazeUpdateAt: lastGazeUpdateAtRef.current,
        ageMs: lastGazeUpdateAtRef.current === null
          ? null
          : Math.round(performance.now() - lastGazeUpdateAtRef.current),
      });
      gazeFreshnessTimeoutRef.current = null;
    }, CALIBRATION_CONFIG.gaze.freshnessTimeoutMs);
  }, []);

  const setCameraPreviewVisible = useCallback((
    visible: boolean,
    showFaceGuide = true,
    anchor: CameraPreviewAnchor = 'top-right',
  ) => {
    const videoContainer = document.getElementById('webgazerVideoContainer');
    if (!videoContainer) return;

    const existingGuide = document.getElementById('gazeFaceGuide');
    if (!visible) {
      if (existingGuide) existingGuide.remove();
      videoContainer.style.display = 'none';
      return;
    }

    videoContainer.style.display = visible ? 'block' : 'none';
    videoContainer.style.position = 'fixed';
    videoContainer.style.width = '180px';
    videoContainer.style.height = '135px';
    videoContainer.style.zIndex = '70';
    videoContainer.style.borderRadius = '10px';
    videoContainer.style.overflow = 'hidden';
    videoContainer.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.28)';
    videoContainer.style.border = '2px solid rgba(255, 255, 255, 0.9)';
    videoContainer.style.cursor = 'move';
    videoContainer.title = 'Drag camera preview to a clear corner';

    const margin = 20;
    const previewPosition = {
      top: anchor.startsWith('top'),
      left: anchor.endsWith('left'),
    };
    if (videoContainer.dataset.userPosition !== 'true') {
      videoContainer.style.top = previewPosition.top ? `${margin}px` : 'auto';
      videoContainer.style.bottom = previewPosition.top ? 'auto' : `${margin}px`;
      videoContainer.style.left = previewPosition.left ? `${margin}px` : 'auto';
      videoContainer.style.right = previewPosition.left ? 'auto' : `${margin}px`;
    }

    if (videoContainer.dataset.dragEnabled !== 'true') {
      let dragOffsetX = 0;
      let dragOffsetY = 0;

      const handlePointerMove = (event: PointerEvent) => {
        if (videoContainer.dataset.dragging !== 'true') return;
        const rect = videoContainer.getBoundingClientRect();
        const nextLeft = Math.min(
          Math.max(8, event.clientX - dragOffsetX),
          Math.max(8, window.innerWidth - rect.width - 8),
        );
        const nextTop = Math.min(
          Math.max(8, event.clientY - dragOffsetY),
          Math.max(8, window.innerHeight - rect.height - 8),
        );
        videoContainer.style.left = `${nextLeft}px`;
        videoContainer.style.top = `${nextTop}px`;
        videoContainer.style.right = 'auto';
        videoContainer.style.bottom = 'auto';
      };

      const handlePointerUp = () => {
        if (videoContainer.dataset.dragging !== 'true') return;
        videoContainer.dataset.dragging = 'false';
        videoContainer.dataset.userPosition = 'true';
      };

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const rect = videoContainer.getBoundingClientRect();
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        videoContainer.dataset.dragging = 'true';
        event.preventDefault();
      };

      videoContainer.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      (videoContainer as HTMLElement & { gazePreviewCleanup?: () => void }).gazePreviewCleanup = () => {
        videoContainer.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
      videoContainer.dataset.dragEnabled = 'true';
    }

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

    let faceGuide = existingGuide;
    if (!faceGuide) {
      faceGuide = document.createElement('div');
      faceGuide.id = 'gazeFaceGuide';
      faceGuide.setAttribute('aria-hidden', 'true');
      videoContainer.appendChild(faceGuide);
    }

    faceGuide.style.display = showFaceGuide ? 'block' : 'none';
    faceGuide.style.position = 'absolute';
    faceGuide.style.inset = '12% 18% 16%';
    faceGuide.style.border = '2px solid rgba(167, 243, 208, 0.82)';
    faceGuide.style.borderRadius = '48% 48% 44% 44%';
    faceGuide.style.boxShadow = '0 0 0 999px rgba(15, 23, 42, 0.10), inset 0 0 20px rgba(167, 243, 208, 0.10)';
    faceGuide.style.pointerEvents = 'none';
    faceGuide.style.zIndex = '3';
    faceGuide.style.transition = 'opacity 180ms ease';
  }, []);

  const startTracking = useCallback(async () => {
    startGazeDiagnosticsSession({
      mode: isDemoRef.current ? 'demo_simulation' : 'camera_gaze',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    logGazeDiagnostic('start_tracking_requested', {
      isDemoSimulation: isDemoRef.current,
      userAgent: navigator.userAgent,
    });
    setErrorMessage(null);
    setFaceStatus('not_detected');
    setGazeStability('warming_up');
    hasReceivedGazeRef.current = false;
    lastGazeUpdateAtRef.current = null;
    lastDiagnosticGazeLogRef.current = 0;
    lastNoDataDiagnosticLogRef.current = 0;
    webgazerCallbackCountRef.current = 0;
    trackerFrameStateRef.current = 'unknown';
    latestEyeFeaturesAtRef.current = null;
    eyeFeatureFrameIdRef.current = 0;
    lastCalibrationAttemptFrameIdRef.current = 0;
    faceLandmarkHistoryRef.current = [];
    consecutiveNoFaceFramesRef.current = 0;
    consecutiveInvalidEyeFramesRef.current = 0;
    lastTrackerDiagnosticAtRef.current = 0;
    if (gazeFreshnessTimeoutRef.current !== null) {
      window.clearTimeout(gazeFreshnessTimeoutRef.current);
      gazeFreshnessTimeoutRef.current = null;
    }
    if (gazeStartupTimeoutRef.current !== null) {
      window.clearTimeout(gazeStartupTimeoutRef.current);
      gazeStartupTimeoutRef.current = null;
    }
    gazeHistoryRef.current = [];
    setGazeCoords({ x: 0, y: 0, timestamp: 0, isValid: false });
    calibrationReturnStatusRef.current = 'not_started';
    trackingStatusRef.current = 'checking_camera';
    setTrackingStatus('checking_camera');

    try {
      // 1. Request camera access explicitly to verify user permissions
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support webcam media devices.');
      }

      const webgazer = await loadWebGazerScript(CALIBRATION_CONFIG.gaze.scriptLoadTimeoutMs);
      logGazeDiagnostic('webgazer_script_ready', {
        version: '3.3.0',
        hasRemoveMouseEventListeners: typeof webgazer.removeMouseEventListeners === 'function',
      });

      runtimeErrorCleanupRef.current?.();
      const handleRuntimeError = (event: ErrorEvent) => {
        logGazeDiagnostic('runtime_error', {
          message: event.message || 'Unknown browser runtime error',
          filename: event.filename || null,
          line: event.lineno || null,
          column: event.colno || null,
          error: event.error?.stack ?? null,
        });
      };
      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        logGazeDiagnostic('runtime_unhandled_rejection', {
          message: reason?.message ?? String(reason ?? 'Unknown rejection'),
          stack: reason?.stack ?? null,
        });
      };
      window.addEventListener('error', handleRuntimeError);
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
      runtimeErrorCleanupRef.current = () => {
        window.removeEventListener('error', handleRuntimeError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
      webGazerConsoleCleanupRef.current?.();
      const originalConsoleLog = console.log;
      const captureWebGazerErrorLog = (...args: unknown[]) => {
        if (args[0] === "can't get pupil features ") {
          const error = args[1] as Error | undefined;
          logGazeDiagnostic('webgazer_internal_inference_error', {
            name: error?.name ?? 'Error',
            message: error?.message ?? String(error ?? 'Unknown eye-feature error'),
            stack: error?.stack ?? null,
          });
        }
        originalConsoleLog.apply(console, args);
      };
      console.log = captureWebGazerErrorLog;
      webGazerConsoleCleanupRef.current = () => {
        if (console.log === captureWebGazerErrorLog) console.log = originalConsoleLog;
      };

      // Configure WebGazer
      resetCalibrationModel();
      if (typeof webgazer.setTracker === 'function') {
        webgazer.setTracker('TFFacemesh');
      }
      const tracker = webgazer.getTracker?.();
      if (!tracker || typeof tracker.getEyePatches !== 'function') {
        throw new Error('WebGazer TFFacemesh tracker is unavailable.');
      }
      const originalGetEyePatches = tracker.getEyePatches;
      tracker.getEyePatches = async function (...args: any[]) {
        try {
          const result = await originalGetEyePatches.apply(this, args);
          updateFaceFeatureStatus(result);
          return result;
        } catch (error: any) {
          trackerFrameStateRef.current = 'inference_error';
          latestEyeFeaturesAtRef.current = null;
          setFaceStatus('gaze_unavailable');
          setGazeStability('unavailable');
          const now = performance.now();
          if (now - lastTrackerDiagnosticAtRef.current >= CALIBRATION_CONFIG.diagnostics.gazeLogIntervalMs) {
            logGazeDiagnostic('webgazer_tracker_inference_error', {
              name: error?.name ?? 'Error',
              message: error?.message ?? String(error),
              stack: error?.stack ?? null,
            });
            lastTrackerDiagnosticAtRef.current = now;
          }
          return null;
        }
      };
      logGazeDiagnostic('webgazer_tracker_configured', {
        trackerName: tracker.name ?? tracker.constructor?.name ?? 'unknown',
        trainingSampleCountBeforeCalibration: getWebGazerTrainingSampleCount(webgazer),
        trackerInstrumentationInstalled: true,
      });
      webgazer.params.showVideo = true;
      webgazer.params.showFaceOverlay = false;
      webgazer.params.showFaceFeedbackBox = false;
      webgazer.showPredictionPoints(false); // We render our own clean reticle

      webgazer.setGazeListener((data: any) => {
        webgazerCallbackCountRef.current += 1;
        const callbackCount = webgazerCallbackCountRef.current;
        if (callbackCount === 1 || callbackCount % 20 === 0) {
          logGazeDiagnostic('webgazer_callback_received', {
            callbackCount,
            hasData: Boolean(data),
            x: data?.x ?? null,
            y: data?.y ?? null,
          });
        }
        const status = trackingStatusRef.current;
        if (!isTrackingActiveRef.current && status !== 'calibrating' && status !== 'validating') {
          logGazeDiagnostic('webgazer_callback_ignored', {
            reason: 'tracking_not_active',
            trackingStatus: status,
          });
          return;
        }
        // Demo Simulation is an explicit alternate source. Never blend its
        // mouse coordinates with the real camera estimate in the same frame.
        if (isDemoRef.current) {
          if (callbackCount === 1) {
            logGazeDiagnostic('webgazer_callback_ignored', { reason: 'demo_simulation_enabled' });
          }
          return;
        }
        if (data) {
          updateGaze(data.x, data.y);
        } else {
          const now = performance.now();
          if (now - lastNoDataDiagnosticLogRef.current >= CALIBRATION_CONFIG.diagnostics.gazeLogIntervalMs) {
            logGazeDiagnostic('webgazer_callback_without_data', {
              callbackCount,
              trackerState: trackerFrameStateRef.current,
              trainingSampleCount: getWebGazerTrainingSampleCount(webgazer),
              noDataReason: trackerFrameStateRef.current === 'eye_features_ready'
                && getWebGazerTrainingSampleCount(webgazer) === 0
                ? 'awaiting_seed_calibration'
                : trackerFrameStateRef.current,
              ...getWebGazerCameraDetails(),
            });
            lastNoDataDiagnosticLogRef.current = now;
          }
        }
      });

      await Promise.race([
        webgazer.begin(),
        new Promise((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('Camera startup timed out. Check the browser camera permission and try again.'));
          }, CALIBRATION_CONFIG.gaze.cameraStartupTimeoutMs);
        }),
      ]);
      logGazeDiagnostic('webgazer_begin_succeeded', {
        callbackCountBeforeBegin: webgazerCallbackCountRef.current,
        ...getWebGazerCameraDetails(),
      });

      // WebGazer registers document-level mouse listeners during begin().
      // Remove them after startup so moving the cursor cannot train or drift
      // the real gaze model during calibration or the experiment.
      disableWebGazerMouseCalibration(webgazer);
      logGazeDiagnostic('webgazer_mouse_calibration_disabled');

      isTrackingActiveRef.current = true;
      trackingStatusRef.current = 'calibrating';
      setTrackingStatus('calibrating');
      gazeStartupTimeoutRef.current = window.setTimeout(() => {
        if (!hasReceivedGazeRef.current && trackingStatusRef.current !== 'not_started') {
          const trainingSampleCount = getWebGazerTrainingSampleCount(webgazer);
          const noDataReason = trackerFrameStateRef.current === 'eye_features_ready'
            && trainingSampleCount === 0
            ? 'awaiting_seed_calibration'
            : trackerFrameStateRef.current === 'face_not_detected'
            ? 'face_not_detected'
            : trackerFrameStateRef.current === 'eye_patch_unavailable'
            ? 'eyes_not_extractable'
            : trackerFrameStateRef.current === 'inference_error'
            ? 'gaze_model_inference_failed'
            : 'no_prediction_produced';
          if (noDataReason === 'face_not_detected') setFaceStatus('not_detected');
          else if (noDataReason === 'eyes_not_extractable' || noDataReason === 'gaze_model_inference_failed') {
            setFaceStatus('gaze_unavailable');
          }
          if (noDataReason !== 'awaiting_seed_calibration') setGazeStability('unavailable');
          logGazeDiagnostic(noDataReason === 'awaiting_seed_calibration'
            ? 'gaze_initialization_waiting_for_calibration'
            : 'gaze_signal_unavailable', {
            reason: noDataReason,
            timeoutMs: CALIBRATION_CONFIG.gaze.startupSignalTimeoutMs,
            webgazerCallbackCount: webgazerCallbackCountRef.current,
            trackerState: trackerFrameStateRef.current,
            trainingSampleCount,
            ...getWebGazerCameraDetails(),
          });
        }
        gazeStartupTimeoutRef.current = null;
      }, CALIBRATION_CONFIG.gaze.startupSignalTimeoutMs);
      return true;
    } catch (err: any) {
      runtimeErrorCleanupRef.current?.();
      runtimeErrorCleanupRef.current = null;
      webGazerConsoleCleanupRef.current?.();
      webGazerConsoleCleanupRef.current = null;
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
      logGazeDiagnostic('tracking_start_failed', {
        name: err?.name ?? 'unknown',
        message: err?.message ?? String(err),
      });
      cleanupWebGazerDOM();
      return false;
    }
  }, [resetCalibrationModel, updateFaceFeatureStatus, updateGaze]);

  const stopTracking = useCallback(() => {
    logGazeDiagnostic('tracking_stop_requested', {
      lastGazeUpdateAt: lastGazeUpdateAtRef.current,
      webgazerCallbackCount: webgazerCallbackCountRef.current,
    });
    isTrackingActiveRef.current = false;
    trackingStatusRef.current = 'not_started';
    runtimeErrorCleanupRef.current?.();
    runtimeErrorCleanupRef.current = null;
    webGazerConsoleCleanupRef.current?.();
    webGazerConsoleCleanupRef.current = null;
    if (gazeFreshnessTimeoutRef.current !== null) {
      window.clearTimeout(gazeFreshnessTimeoutRef.current);
      gazeFreshnessTimeoutRef.current = null;
    }
    setCameraPreviewVisible(false);
    cleanupWebGazerDOM();
    setTrackingStatus('not_started');
    setErrorMessage(null);
    setGazeCoords({ x: 0, y: 0, timestamp: 0, isValid: false });
    lastCoordsRef.current = { x: 0, y: 0 };
    gazeHistoryRef.current = [];
    setGazeStability('unavailable');
    setFaceStatus('not_detected');
    hasReceivedGazeRef.current = false;
    if (gazeStartupTimeoutRef.current !== null) {
      window.clearTimeout(gazeStartupTimeoutRef.current);
      gazeStartupTimeoutRef.current = null;
    }
  }, [setCameraPreviewVisible]);

  const pauseTracking = useCallback(() => {
    if (window.webgazer && typeof window.webgazer.pause === 'function') {
      window.webgazer.pause();
    }
    isTrackingActiveRef.current = false;
    trackingStatusRef.current = 'paused';
    setTrackingStatus('paused');
    logGazeDiagnostic('tracking_paused');
  }, []);

  const resumeTracking = useCallback(() => {
    if (window.webgazer && typeof window.webgazer.resume === 'function') {
      window.webgazer.resume();
    }
    disableWebGazerMouseCalibration();
    isTrackingActiveRef.current = true;
    trackingStatusRef.current = 'tracking';
    setTrackingStatus('tracking');
    logGazeDiagnostic('tracking_resumed');
  }, []);

  const startCalibration = useCallback(() => {
    const currentStatus = trackingStatusRef.current;
    if (currentStatus !== 'calibrating' && currentStatus !== 'validating') {
      calibrationReturnStatusRef.current = currentStatus === 'tracking' ? 'tracking' : 'not_started';
    }
    disableWebGazerMouseCalibration();
    logGazeDiagnostic('calibration_started', { mode: 'full' });
    resetCalibrationModel();
    lastCalibrationAttemptFrameIdRef.current = eyeFeatureFrameIdRef.current;
    lastCoordsRef.current = { x: 0, y: 0 };
    gazeHistoryRef.current = [];
    setGazeCoords({ x: 0, y: 0, timestamp: 0, isValid: false });
    setGazeStability('warming_up');
    trackingStatusRef.current = 'calibrating';
    setTrackingStatus('calibrating');
  }, [resetCalibrationModel]);

  const startLocalCalibration = useCallback(() => {
    disableWebGazerMouseCalibration();
    logGazeDiagnostic('calibration_started', { mode: 'local' });
    lastCalibrationAttemptFrameIdRef.current = eyeFeatureFrameIdRef.current;
    trackingStatusRef.current = 'calibrating';
    setTrackingStatus('calibrating');
    isTrackingActiveRef.current = true;
  }, []);

  const startValidation = useCallback(() => {
    disableWebGazerMouseCalibration();
    logGazeDiagnostic('validation_started');
    trackingStatusRef.current = 'validating';
    setTrackingStatus('validating');
  }, []);

  const finishCalibration = useCallback(() => {
    setCameraPreviewVisible(false);
    trackingStatusRef.current = 'tracking';
    setTrackingStatus('tracking');
    isTrackingActiveRef.current = true;
    logGazeDiagnostic('calibration_finished');
  }, [setCameraPreviewVisible]);

  const cancelCalibration = useCallback(() => {
    setCameraPreviewVisible(false);
    logGazeDiagnostic('calibration_cancelled');
    if (calibrationReturnStatusRef.current === 'tracking') {
      trackingStatusRef.current = 'tracking';
      setTrackingStatus('tracking');
      isTrackingActiveRef.current = true;
      return;
    }

    isTrackingActiveRef.current = false;
    trackingStatusRef.current = 'not_started';
    setTrackingStatus('not_started');
    runtimeErrorCleanupRef.current?.();
    runtimeErrorCleanupRef.current = null;
    webGazerConsoleCleanupRef.current?.();
    webGazerConsoleCleanupRef.current = null;
    cleanupWebGazerDOM();
  }, [setCameraPreviewVisible]);

  const recordCalibrationPoint = useCallback((x: number, y: number): CalibrationPointRecordResult => {
    disableWebGazerMouseCalibration();
    const webgazer = window.webgazer;
    const eyeFeaturesAgeMs = latestEyeFeaturesAtRef.current === null
      ? null
      : Math.round(performance.now() - latestEyeFeaturesAtRef.current);
    const hasFreshEyeFeatures = trackerFrameStateRef.current === 'eye_features_ready'
      && eyeFeaturesAgeMs !== null
      && eyeFeaturesAgeMs <= CALIBRATION_CONFIG.maxEyeFeatureAgeMs;
    const sampleCountBefore = getWebGazerTrainingSampleCount(webgazer);

    if (!webgazer || typeof webgazer.recordScreenPosition !== 'function' || !hasFreshEyeFeatures) {
      const reason = !webgazer || typeof webgazer.recordScreenPosition !== 'function'
        ? 'webgazer_record_api_unavailable'
        : trackerFrameStateRef.current !== 'eye_features_ready'
        ? 'eye_features_unavailable'
        : 'eye_features_stale';
      logGazeDiagnostic('calibration_label_record_skipped', {
        targetX: Math.round(x),
        targetY: Math.round(y),
        trackerState: trackerFrameStateRef.current,
        eyeFeaturesAgeMs,
        eyeFeatureFrameId: eyeFeatureFrameIdRef.current,
        trainingSampleCount: sampleCountBefore,
        reason,
      });
      return {
        recorded: false,
        reason,
        eyeFeatureFrameId: eyeFeatureFrameIdRef.current,
        eyeFeaturesAgeMs,
      };
    }

    if (eyeFeatureFrameIdRef.current <= lastCalibrationAttemptFrameIdRef.current) {
      return { recorded: false, reason: 'duplicate_eye_feature_frame' };
    }
    lastCalibrationAttemptFrameIdRef.current = eyeFeatureFrameIdRef.current;

    try {
      // recordScreenPosition labels the latest camera-derived eye features;
      // it does not read or use the mouse cursor position.
      webgazer.recordScreenPosition(x, y, 'click');
      const sampleCountAfter = getWebGazerTrainingSampleCount(webgazer);
      const recorded = sampleCountBefore === null || sampleCountAfter === null
        ? true
        : sampleCountAfter > sampleCountBefore;
      logGazeDiagnostic(recorded ? 'calibration_label_recorded' : 'calibration_label_record_skipped', {
        targetX: Math.round(x),
        targetY: Math.round(y),
        eyeFeaturesAgeMs,
        eyeFeatureFrameId: eyeFeatureFrameIdRef.current,
        trainingSampleCountBefore: sampleCountBefore,
        trainingSampleCountAfter: sampleCountAfter,
        reason: recorded ? null : 'webgazer_did_not_accept_eye_features',
      });
      return {
        recorded,
        reason: recorded ? undefined : 'webgazer_did_not_accept_eye_features',
        eyeFeatureFrameId: eyeFeatureFrameIdRef.current,
        eyeFeaturesAgeMs,
        trainingSampleCountBefore: sampleCountBefore,
        trainingSampleCountAfter: sampleCountAfter,
      };
    } catch (error: any) {
      logGazeDiagnostic('calibration_label_record_failed', {
        targetX: Math.round(x),
        targetY: Math.round(y),
        message: error?.message ?? String(error),
      });
      console.warn('WebGazer calibration sample recording failed:', error);
      return { recorded: false, reason: 'webgazer_record_screen_position_failed' };
    }
  }, []);

  // Handle Demo Simulation mouse coordinates only. In normal camera mode this
  // listener is not registered, so mouse movement cannot move the gaze reticle.
  useEffect(() => {
    if (!isDemoSimulation) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDemoRef.current) return;
      updateGaze(e.clientX, e.clientY, 'demo_mouse');
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
      if (gazeStartupTimeoutRef.current !== null) {
        window.clearTimeout(gazeStartupTimeoutRef.current);
      }
      runtimeErrorCleanupRef.current?.();
      runtimeErrorCleanupRef.current = null;
      webGazerConsoleCleanupRef.current?.();
      webGazerConsoleCleanupRef.current = null;
      cleanupWebGazerDOM();
    };
  }, []);

    return {
    trackingStatus,
    faceStatus,
    gazeStability,
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
    startLocalCalibration,
    startValidation,
    finishCalibration,
    cancelCalibration,
    recordCalibrationPoint,
    setCameraPreviewVisible,
  };
}
