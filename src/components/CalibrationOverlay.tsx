/**
 * Component: CalibrationOverlay
 * Camera positioning, sequential WebGazer calibration, and independent validation.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  Eye,
  RotateCcw,
  ScanFace,
  Target,
  X,
} from 'lucide-react';
import {
  CalibrationRegionError,
  CalibrationPointRecordResult,
  CalibrationResult,
  CalibrationSampleRecord,
  CalibrationSessionRecord,
  CameraPreviewAnchor,
  FaceTrackingStatus,
  GazeStabilityStatus,
  GazeCoordinates,
} from '../types';
import { soundFx } from '../utils/audio';
import { CALIBRATION_CONFIG } from '../config/calibration';
import { logGazeDiagnostic } from '../utils/gazeDiagnostics';

interface CalibrationOverlayProps {
  isOpen: boolean;
  participantId: string;
  gazeCoords: GazeCoordinates;
  faceStatus: FaceTrackingStatus;
  gazeStability: GazeStabilityStatus;
  onBeginPointCalibration: () => void;
  onBeginLocalCalibration: () => void;
  onStartValidation: () => void;
  onValidationComplete: (result: CalibrationResult) => void;
  onCalibrationSessionComplete: (session: CalibrationSessionRecord) => void;
  onCameraPreviewVisible: (
    visible: boolean,
    showFaceGuide?: boolean,
    anchor?: CameraPreviewAnchor,
  ) => void;
  onFinish: () => void;
  onCancel: () => void;
  onRecordPoint: (x: number, y: number) => CalibrationPointRecordResult;
}

interface PointState {
  id: number;
  xPercent: number;
  yPercent: number;
  samplesRemaining: number;
  completed: boolean;
}

interface ValidationPoint {
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
  calibrationPointIndex: number;
}

type CalibrationPhase = 'setup' | 'calibrating' | 'validating' | 'result';

const {
  samplesPerPoint: CALIBRATION_SAMPLES_PER_POINT,
  stableWaitMs: CALIBRATION_STABLE_WAIT_MS,
  sampleIntervalMs: CALIBRATION_SAMPLE_INTERVAL_MS,
  targetAlignmentTolerancePx: TARGET_ALIGNMENT_TOLERANCE_PX,
  validation: {
    settleMs: VALIDATION_SETTLE_MS,
    samplesPerPoint: VALIDATION_SAMPLES_PER_POINT,
    maxCollectionMs: VALIDATION_MAX_COLLECTION_MS,
    sampleIntervalMs: VALIDATION_SAMPLE_INTERVAL_MS,
  },
  validationMetrics,
} = CALIBRATION_CONFIG;
const VALIDATION_POINTS: ValidationPoint[] = [
  { id: 'top-left', label: 'Top left', xPercent: 18, yPercent: 18, calibrationPointIndex: 0 },
  { id: 'top-right', label: 'Top right', xPercent: 82, yPercent: 18, calibrationPointIndex: 2 },
  { id: 'center', label: 'Center', xPercent: 50, yPercent: 50, calibrationPointIndex: 4 },
  { id: 'bottom-left', label: 'Bottom left', xPercent: 18, yPercent: 82, calibrationPointIndex: 6 },
  { id: 'bottom-right', label: 'Bottom right', xPercent: 82, yPercent: 82, calibrationPointIndex: 8 },
];

const INITIAL_POINTS: PointState[] = [
  { id: 1, xPercent: 10, yPercent: 12, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 2, xPercent: 50, yPercent: 12, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 3, xPercent: 90, yPercent: 12, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 4, xPercent: 10, yPercent: 50, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 5, xPercent: 50, yPercent: 50, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 6, xPercent: 90, yPercent: 50, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 7, xPercent: 10, yPercent: 88, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 8, xPercent: 50, yPercent: 88, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
  { id: 9, xPercent: 90, yPercent: 88, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false },
];

function getScreenPoint(point: { xPercent: number; yPercent: number }) {
  return {
    x: (window.innerWidth * point.xPercent) / 100,
    y: (window.innerHeight * point.yPercent) / 100,
  };
}

function getRegionLabel(point: { xPercent: number; yPercent: number }) {
  const horizontal = point.xPercent < 34 ? 'left' : point.xPercent > 66 ? 'right' : 'center';
  const vertical = point.yPercent < 34 ? 'top' : point.yPercent > 66 ? 'bottom' : 'center';
  return vertical === 'center' && horizontal === 'center'
    ? 'center'
    : `${vertical}-${horizontal}`;
}

function calculateMean(values: number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function calculateMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function filterOutlierErrors(values: number[]) {
  if (values.length < validationMetrics.outlierMinSamples) return values;

  const median = calculateMedian(values);
  const deviations = values.map((value) => Math.abs(value - median));
  const mad = calculateMedian(deviations);
  const threshold = Math.max(
    validationMetrics.outlierMinThresholdPx,
    mad * validationMetrics.outlierMadMultiplier,
  );
  const filtered = values.filter((value) => Math.abs(value - median) <= threshold);

  // Keep enough evidence for the validation result even when a noisy camera
  // produces an unusually tight MAD estimate.
  return filtered.length >= Math.max(
    validationMetrics.outlierMinimumRetainedSamples,
    Math.floor(values.length * validationMetrics.outlierMinimumRetainedFraction),
  )
    ? filtered
    : values;
}

function getWeakCalibrationRegions(regions: CalibrationRegionError[]) {
  const screenScale = Math.min(window.innerWidth, window.innerHeight);
  const medianErrorLimit = screenScale * validationMetrics.passMedianErrorRatio;

  return regions
    .filter((region) => (
      region.sampleCount === 0
      || region.medianErrorPx > medianErrorLimit
      || region.withinTolerancePercent < validationMetrics.passWithinTolerancePercent
    ))
    .sort((a, b) => {
      const aScore = Math.max(
        a.medianErrorPx / medianErrorLimit,
        (validationMetrics.passWithinTolerancePercent - a.withinTolerancePercent)
          / validationMetrics.passWithinTolerancePercent,
      );
      const bScore = Math.max(
        b.medianErrorPx / medianErrorLimit,
        (validationMetrics.passWithinTolerancePercent - b.withinTolerancePercent)
          / validationMetrics.passWithinTolerancePercent,
      );
      return bScore - aScore;
    });
}

function getRecalibrationCandidates(regions: CalibrationRegionError[], includePassingRegions: boolean) {
  return includePassingRegions
    ? regions
      .filter((region) => region.sampleCount > 0)
      .sort((a, b) => b.medianErrorPx - a.medianErrorPx)
    : getWeakCalibrationRegions(regions).filter((region) => region.sampleCount > 0);
}

function faceStatusCopy(status: FaceTrackingStatus) {
  switch (status) {
    case 'stable':
      return {
        label: 'Position stable',
        detail: 'Your face and eye position are steady enough to collect a sample.',
        tone: 'emerald',
        actions: [],
      };
    case 'moving':
      return {
        label: 'Position moving',
        detail: 'Pause your head movement briefly; natural blinking is okay.',
        tone: 'amber',
        actions: ['Keep both eyes inside the camera preview.', 'Relax your shoulders and avoid leaning toward the screen.'],
      };
    case 'detected':
      return {
        label: 'Face detected',
        detail: 'Keep both eyes visible while the camera estimates a steady position.',
        tone: 'sky',
        actions: [],
      };
    case 'gaze_unavailable':
      return {
        label: 'Eyes not detected clearly',
        detail: 'The camera is active, but it cannot currently extract stable eye features.',
        tone: 'rose',
        actions: [
          'Move your face nearer the centre of the camera preview and keep both eyes visible.',
          'Use even front lighting; avoid a bright window behind you or strong shadows.',
          'If you wear glasses, reduce screen reflections by slightly changing the screen or head angle.',
          'Wait two or three seconds after each adjustment so the tracker can recover.',
        ],
      };
    case 'not_detected':
    default:
      return {
        label: 'Face not detected',
        detail: 'No usable face features have arrived from the camera yet.',
        tone: 'rose',
        actions: [
          'Check that the browser has camera permission for this page.',
          'Place your face fully inside the camera preview with both eyes visible.',
          'Increase front lighting and remove anything covering the eyes.',
        ],
      };
  }
}

function gazeStabilityLabel(status: GazeStabilityStatus) {
  switch (status) {
    case 'stable': return 'Stable';
    case 'moving': return 'Moving';
    case 'warming_up': return 'Warming up';
    case 'unavailable':
    default: return 'Unavailable';
  }
}

function getPreviewAnchor(point: { xPercent: number; yPercent: number }): CameraPreviewAnchor {
  if (point.yPercent <= 35) {
    return point.xPercent >= 50 ? 'bottom-left' : 'bottom-right';
  }
  if (point.yPercent >= 65) {
    return point.xPercent >= 50 ? 'top-left' : 'top-right';
  }
  return 'top-right';
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  isOpen,
  participantId,
  gazeCoords,
  faceStatus,
  gazeStability,
  onBeginPointCalibration,
  onBeginLocalCalibration,
  onStartValidation,
  onValidationComplete,
  onCalibrationSessionComplete,
  onCameraPreviewVisible,
  onFinish,
  onCancel,
  onRecordPoint,
}) => {
  const [phase, setPhase] = useState<CalibrationPhase>('setup');
  const [points, setPoints] = useState<PointState[]>(INITIAL_POINTS);
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [validationIndex, setValidationIndex] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [validationResult, setValidationResult] = useState<CalibrationResult | null>(null);
  const [showFaceGuide, setShowFaceGuide] = useState(true);
  const [captureReady, setCaptureReady] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const [isLocalCalibration, setIsLocalCalibration] = useState(false);
  const [localRegionLabel, setLocalRegionLabel] = useState<string | null>(null);
  const [localPointIndexes, setLocalPointIndexes] = useState<number[]>([]);
  const [selectedLocalRegionIds, setSelectedLocalRegionIds] = useState<string[]>([]);

  const validationSamplesRef = useRef<number[]>([]);
  const calibrationSamplesRef = useRef<number>(0);
  const validationRawSamplesRef = useRef<number[][]>(VALIDATION_POINTS.map(() => []));
  const validationFilteredSamplesRef = useRef<number[][]>(VALIDATION_POINTS.map(() => []));
  const calibrationSampleRecordsRef = useRef<CalibrationSampleRecord[]>([]);
  const validationSampleRecordsRef = useRef<CalibrationSampleRecord[]>([]);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sessionModeRef = useRef<'full' | 'local'>('full');
  const collectingRef = useRef(false);
  const stableSinceRef = useRef<number | null>(null);
  const onValidationCompleteRef = useRef(onValidationComplete);
  const onCalibrationSessionCompleteRef = useRef(onCalibrationSessionComplete);
  const latestGazeRef = useRef(gazeCoords);
  const latestFaceStatusRef = useRef(faceStatus);
  const latestGazeStabilityRef = useRef(gazeStability);
  latestGazeRef.current = gazeCoords;
  latestFaceStatusRef.current = faceStatus;
  latestGazeStabilityRef.current = gazeStability;

  useEffect(() => {
    onValidationCompleteRef.current = onValidationComplete;
  }, [onValidationComplete]);

  useEffect(() => {
    onCalibrationSessionCompleteRef.current = onCalibrationSessionComplete;
  }, [onCalibrationSessionComplete]);

  useEffect(() => {
    if (!isOpen) return;
    logGazeDiagnostic('calibration_overlay_opened', { participantId });
    setPhase('setup');
    setPoints(INITIAL_POINTS);
    setActivePointIndex(0);
    setValidationIndex(0);
    setIsCollecting(false);
    setValidationProgress(0);
    setValidationResult(null);
    setCaptureReady(false);
    setStabilityProgress(0);
    setIsLocalCalibration(false);
    setLocalRegionLabel(null);
    setLocalPointIndexes([]);
    setSelectedLocalRegionIds([]);
    calibrationSamplesRef.current = 0;
    validationSamplesRef.current = [];
    validationRawSamplesRef.current = VALIDATION_POINTS.map(() => []);
    validationFilteredSamplesRef.current = VALIDATION_POINTS.map(() => []);
    calibrationSampleRecordsRef.current = [];
    validationSampleRecordsRef.current = [];
    sessionIdRef.current = crypto.randomUUID();
    sessionModeRef.current = 'full';
    collectingRef.current = false;
    calibrationSamplesRef.current = 0;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    logGazeDiagnostic('calibration_phase_changed', { phase });
    onCameraPreviewVisible(phase !== 'result', showFaceGuide);
  }, [isOpen, phase, showFaceGuide, onCameraPreviewVisible, participantId]);

  useEffect(() => {
    if (!isOpen || phase !== 'calibrating') return;

    stableSinceRef.current = null;
    setCaptureReady(false);
    setStabilityProgress(0);
    let animationFrameId = 0;
    let captureReadyLogged = false;

    const updateStability = () => {
      // Stable camera landmarks can seed WebGazer before its regression has
      // enough labeled samples to produce screen-coordinate estimates.
      const stable = faceStatus === 'stable';
      if (stable) {
        if (stableSinceRef.current === null) {
          stableSinceRef.current = performance.now();
          logGazeDiagnostic('calibration_stability_started', {
            pointIndex: activePointIndex,
            gazeX: gazeCoords.isValid ? gazeCoords.x : null,
            gazeY: gazeCoords.isValid ? gazeCoords.y : null,
            gazeAvailable: gazeCoords.isValid,
            faceStatus,
            gazeStability: latestGazeStabilityRef.current,
          });
        }
        const elapsed = performance.now() - stableSinceRef.current;
        const progress = Math.min(1, elapsed / CALIBRATION_STABLE_WAIT_MS);
        setStabilityProgress(progress);
        if (progress >= 1 && !captureReadyLogged) {
          logGazeDiagnostic('calibration_capture_ready', {
            pointIndex: activePointIndex,
            elapsedMs: Math.round(elapsed),
            gazeX: gazeCoords.isValid ? gazeCoords.x : null,
            gazeY: gazeCoords.isValid ? gazeCoords.y : null,
            gazeAvailable: gazeCoords.isValid,
            faceStatus,
            gazeStability: latestGazeStabilityRef.current,
          });
          captureReadyLogged = true;
        }
        setCaptureReady(progress >= 1);
      } else {
        if (stableSinceRef.current !== null) {
          logGazeDiagnostic('calibration_stability_reset', {
            pointIndex: activePointIndex,
            reason: `face_status_${faceStatus}`,
            gazeStability: latestGazeStabilityRef.current,
          });
        }
        stableSinceRef.current = null;
        setStabilityProgress(0);
        setCaptureReady(false);
      }

      animationFrameId = window.requestAnimationFrame(updateStability);
    };

    animationFrameId = window.requestAnimationFrame(updateStability);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isOpen, phase, activePointIndex, captureEpoch, faceStatus, gazeCoords.isValid]);

  useEffect(() => {
    if (!isOpen || phase !== 'validating') return;

    validationSamplesRef.current = [];
    collectingRef.current = false;
    setIsCollecting(false);
    setValidationProgress(0);

    const startedAt = performance.now();
    let collectionStarted = false;
    let lastSampledAt = 0;
    let lastSampledGazeTimestamp = 0;
    let animationFrameId = 0;

    const finishValidationPoint = () => {
      collectingRef.current = false;
      setIsCollecting(false);
      setValidationProgress(1);

      const rawPointSamples = validationSamplesRef.current;
      const filteredPointSamples = filterOutlierErrors(rawPointSamples);
      const pointId = VALIDATION_POINTS[validationIndex].id;
      const retainedErrors = [...filteredPointSamples];
      validationSampleRecordsRef.current
        .filter((sample) => sample.pointId === pointId)
        .forEach((sample) => {
          if (sample.errorPx === null) {
            sample.accepted = false;
            return;
          }
          const retainedIndex = retainedErrors.indexOf(sample.errorPx);
          sample.accepted = retainedIndex >= 0;
          if (retainedIndex >= 0) retainedErrors.splice(retainedIndex, 1);
        });
      validationRawSamplesRef.current[validationIndex] = rawPointSamples;
      validationFilteredSamplesRef.current[validationIndex] = filteredPointSamples;
      logGazeDiagnostic('calibration_validation_point_completed', {
        pointIndex: VALIDATION_POINTS[validationIndex].calibrationPointIndex,
        pointId,
        rawSampleCount: rawPointSamples.length,
        retainedSampleCount: filteredPointSamples.length,
      });

      if (validationIndex < VALIDATION_POINTS.length - 1) {
        setValidationIndex((current) => current + 1);
        return;
      }

      const tolerancePx = Math.min(window.innerWidth, window.innerHeight)
        * validationMetrics.toleranceRatio;
      const rawErrors = validationRawSamplesRef.current.flat();
      const errors = validationFilteredSamplesRef.current.flat();
      const validSampleCount = errors.length;
      const meanErrorPx = calculateMean(errors);
      const medianErrorPx = calculateMedian(errors);
      const withinTolerancePercent = validSampleCount > 0
        ? (errors.filter((error) => error <= tolerancePx).length / validSampleCount) * 100
        : 0;
      const regionErrors: CalibrationRegionError[] = VALIDATION_POINTS.map((point, index) => {
        const regionSamples = validationFilteredSamplesRef.current[index];
        return {
          id: point.id,
          label: point.label,
          xPercent: point.xPercent,
          yPercent: point.yPercent,
          calibrationPointIndex: point.calibrationPointIndex,
          sampleCount: regionSamples.length,
          medianErrorPx: calculateMedian(regionSamples),
          meanErrorPx: calculateMean(regionSamples),
          withinTolerancePercent: regionSamples.length > 0
            ? (regionSamples.filter((error) => error <= tolerancePx).length / regionSamples.length) * 100
            : 0,
        };
      });
      const result: CalibrationResult = {
        validSampleCount,
        rawSampleCount: rawErrors.length,
        discardedSampleCount: Math.max(0, rawErrors.length - validSampleCount),
        meanErrorPx,
        medianErrorPx,
        withinTolerancePercent,
        regionErrors,
        passed: validSampleCount >= validationMetrics.passMinimumSamples
          && medianErrorPx <= Math.min(window.innerWidth, window.innerHeight)
            * validationMetrics.passMedianErrorRatio
          && withinTolerancePercent >= validationMetrics.passWithinTolerancePercent,
      };

      logGazeDiagnostic('calibration_run_completed', {
        sessionId: sessionIdRef.current,
        mode: sessionModeRef.current,
        trainingSampleCount: calibrationSampleRecordsRef.current.length,
        validationSampleCount: validationSampleRecordsRef.current.length,
        result: {
          medianErrorPx,
          withinTolerancePercent,
          passed: result.passed,
          regions: regionErrors.map((region) => ({
            id: region.id,
            sampleCount: region.sampleCount,
            medianErrorPx: region.medianErrorPx,
            withinTolerancePercent: region.withinTolerancePercent,
          })),
        },
      });
      setValidationResult(result);
      const localCandidates = getRecalibrationCandidates(regionErrors, result.passed);
      setSelectedLocalRegionIds(localCandidates.slice(0, 1).map((region) => region.id));
      setPhase('result');
      onValidationCompleteRef.current(result);
      onCalibrationSessionCompleteRef.current({
        sessionId: sessionIdRef.current,
        participant: participantId,
        calibratedAt: new Date().toISOString(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        mode: sessionModeRef.current,
        samples: [
          ...calibrationSampleRecordsRef.current,
          ...validationSampleRecordsRef.current,
        ],
        result,
        config: {
          samplesPerPoint: CALIBRATION_SAMPLES_PER_POINT,
          stableWaitMs: CALIBRATION_STABLE_WAIT_MS,
          sampleIntervalMs: CALIBRATION_SAMPLE_INTERVAL_MS,
          maxEyeFeatureAgeMs: CALIBRATION_CONFIG.maxEyeFeatureAgeMs,
          smoothingFactor: CALIBRATION_CONFIG.gaze.smoothingFactor,
          validationSamplesPerPoint: VALIDATION_SAMPLES_PER_POINT,
        },
      });
    };

    const updateValidationProgress = () => {
      const elapsed = performance.now() - startedAt;

      if (elapsed >= VALIDATION_SETTLE_MS && !collectionStarted) {
        collectionStarted = true;
        collectingRef.current = true;
        setIsCollecting(true);
      }

      if (
        collectionStarted
        && latestFaceStatusRef.current === 'stable'
        && latestGazeRef.current.isValid
        && latestGazeRef.current.timestamp > lastSampledGazeTimestamp
        && performance.now() - latestGazeRef.current.timestamp <= CALIBRATION_CONFIG.gaze.freshnessTimeoutMs
        && performance.now() - lastSampledAt >= VALIDATION_SAMPLE_INTERVAL_MS
      ) {
        const target = getScreenPoint(VALIDATION_POINTS[validationIndex]);
        const predicted = latestGazeRef.current;
        const distance = Math.hypot(predicted.x - target.x, predicted.y - target.y);
        if (Number.isFinite(distance)) {
          logGazeDiagnostic('calibration_validation_sample', {
            pointIndex: VALIDATION_POINTS[validationIndex].calibrationPointIndex,
            pointId: VALIDATION_POINTS[validationIndex].id,
            sampleNumber: validationSamplesRef.current.length + 1,
            targetX: Math.round(target.x),
            targetY: Math.round(target.y),
            predictedX: predicted.x,
            predictedY: predicted.y,
            errorPx: Math.round(distance * 100) / 100,
            gazeTimestamp: predicted.timestamp,
            faceStatus: latestFaceStatusRef.current,
            gazeStability: latestGazeStabilityRef.current,
            sessionId: sessionIdRef.current,
          });
          validationSamplesRef.current.push(distance);
          validationSampleRecordsRef.current.push({
            sampleId: crypto.randomUUID(),
            sessionId: sessionIdRef.current,
            participant: participantId,
            phase: 'validation',
            pointId: VALIDATION_POINTS[validationIndex].id,
            pointIndex: VALIDATION_POINTS[validationIndex].calibrationPointIndex,
            region: VALIDATION_POINTS[validationIndex].label.toLowerCase().replaceAll(' ', '-'),
            targetX: target.x,
            targetY: target.y,
            predictedX: predicted.x,
            predictedY: predicted.y,
            errorPx: distance,
            gazeStability: latestGazeStabilityRef.current,
            gazeTimestamp: predicted.timestamp,
            accepted: undefined,
            timestamp: new Date().toISOString(),
          });
          lastSampledAt = performance.now();
          lastSampledGazeTimestamp = predicted.timestamp;
        }
      }

      const progress = Math.min(1, validationSamplesRef.current.length / VALIDATION_SAMPLES_PER_POINT);
      setValidationProgress(progress);

      if (
        collectionStarted
        && (
          validationSamplesRef.current.length >= VALIDATION_SAMPLES_PER_POINT
          || elapsed >= VALIDATION_SETTLE_MS + VALIDATION_MAX_COLLECTION_MS
        )
      ) {
        finishValidationPoint();
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateValidationProgress);
    };

    animationFrameId = window.requestAnimationFrame(updateValidationProgress);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      collectingRef.current = false;
    };
  }, [isOpen, phase, validationIndex, participantId]);

  const activePoint = points[activePointIndex];
  const visiblePointIndexes = isLocalCalibration ? localPointIndexes : points.map((_, index) => index);
  const visiblePointPosition = visiblePointIndexes.indexOf(activePointIndex);
  const visiblePoints = visiblePointIndexes.map((index) => points[index]).filter(Boolean);
  const completedCount = visiblePoints.filter((point) => point.completed).length;
  const completedSamples = points.reduce(
    (total, point, index) => visiblePointIndexes.includes(index)
      ? total + (CALIBRATION_SAMPLES_PER_POINT - point.samplesRemaining)
      : total,
    0,
  );
  const totalSamples = visiblePointIndexes.length * CALIBRATION_SAMPLES_PER_POINT;
  const calibrationProgress = Math.round((completedSamples / totalSamples) * 100);
  const validationTarget = VALIDATION_POINTS[validationIndex];
  const status = faceStatusCopy(faceStatus);
  const previewTarget = phase === 'validating' ? validationTarget : activePoint;
  const previewAnchor = previewTarget ? getPreviewAnchor(previewTarget) : 'top-right';

  useEffect(() => {
    if (!isOpen || phase === 'setup') return;

    const videoContainer = document.getElementById('webgazerVideoContainer');
    if (!videoContainer || videoContainer.style.display === 'none' || videoContainer.dataset.userPosition === 'true') {
      return;
    }

    onCameraPreviewVisible(true, showFaceGuide, previewAnchor);
  }, [
    isOpen,
    phase,
    activePointIndex,
    validationIndex,
    previewAnchor,
    showFaceGuide,
    onCameraPreviewVisible,
  ]);

  const activeTargetScreenPoint = activePoint ? getScreenPoint(activePoint) : null;
  const gazeDistanceToTarget = activeTargetScreenPoint && gazeCoords.isValid
    ? Math.hypot(
        gazeCoords.x - activeTargetScreenPoint.x,
        gazeCoords.y - activeTargetScreenPoint.y,
      )
    : Number.POSITIVE_INFINITY;
  const isTargetAligned = phase === 'calibrating'
    && gazeCoords.isValid
    && gazeDistanceToTarget <= TARGET_ALIGNMENT_TOLERANCE_PX;

  const startValidationPhase = () => {
    soundFx.playSelectSuccess();
    setValidationIndex(0);
    setPhase('validating');
    onStartValidation();
  };

  const beginPointCalibration = () => {
    setIsLocalCalibration(false);
    setLocalRegionLabel(null);
    calibrationSamplesRef.current = 0;
    logGazeDiagnostic('calibration_run_started', {
      sessionId: sessionIdRef.current,
      mode: 'full',
      pointCount: INITIAL_POINTS.length,
    });
    setPhase('calibrating');
    onBeginPointCalibration();
  };

  useEffect(() => {
    if (!isOpen || phase !== 'calibrating' || !activePoint || !captureReady) return;

    const target = getScreenPoint(activePoint);
    const sampleTimer = window.setInterval(() => {
      if (latestFaceStatusRef.current !== 'stable') return;
      const capture = onRecordPoint(target.x, target.y);
      if (!capture.recorded) {
        if (capture.reason !== 'duplicate_eye_feature_frame') {
          logGazeDiagnostic('calibration_training_sample_rejected', {
            sessionId: sessionIdRef.current,
            pointIndex: activePointIndex,
            pointId: activePoint.id,
            reason: capture.reason ?? 'eye_features_unavailable',
            faceStatus: latestFaceStatusRef.current,
            eyeFeatureFrameId: capture.eyeFeatureFrameId ?? null,
            eyeFeaturesAgeMs: capture.eyeFeaturesAgeMs ?? null,
          });
        }
        return;
      }

      const predicted = latestGazeRef.current;
      const errorPx = predicted.isValid
        ? Math.hypot(predicted.x - target.x, predicted.y - target.y)
        : null;
      const sampleNumber = calibrationSamplesRef.current + 1;
      logGazeDiagnostic('calibration_training_sample', {
        sessionId: sessionIdRef.current,
        pointIndex: activePointIndex,
        pointId: activePoint.id,
        sampleNumber,
        targetX: Math.round(target.x),
        targetY: Math.round(target.y),
        predictedX: predicted.isValid ? predicted.x : null,
        predictedY: predicted.isValid ? predicted.y : null,
        errorPx: errorPx === null ? null : Math.round(errorPx * 100) / 100,
        gazeAvailable: predicted.isValid,
        gazeTimestamp: predicted.timestamp,
        faceStatus: latestFaceStatusRef.current,
        gazeStability: latestGazeStabilityRef.current,
        eyeFeatureFrameId: capture.eyeFeatureFrameId,
        eyeFeaturesAgeMs: capture.eyeFeaturesAgeMs,
        trainingSampleCountBefore: capture.trainingSampleCountBefore,
        trainingSampleCountAfter: capture.trainingSampleCountAfter,
      });
      calibrationSampleRecordsRef.current.push({
        sampleId: crypto.randomUUID(),
        sessionId: sessionIdRef.current,
        participant: participantId,
        phase: 'training',
        pointId: String(activePoint.id),
        pointIndex: activePointIndex,
        region: getRegionLabel(activePoint),
        targetX: target.x,
        targetY: target.y,
        predictedX: predicted.isValid ? predicted.x : null,
        predictedY: predicted.isValid ? predicted.y : null,
        errorPx,
        gazeStability: latestGazeStabilityRef.current,
        eyeFeatureFrameId: capture.eyeFeatureFrameId,
        eyeFeaturesAgeMs: capture.eyeFeaturesAgeMs ?? undefined,
        gazeTimestamp: predicted.isValid ? predicted.timestamp : undefined,
        accepted: true,
        timestamp: new Date().toISOString(),
      });
      calibrationSamplesRef.current += 1;

      const samplesAfter = calibrationSamplesRef.current;
      setPoints((current) => current.map((point, index) => (
        index === activePointIndex
          ? { ...point, samplesRemaining: Math.max(0, CALIBRATION_SAMPLES_PER_POINT - samplesAfter), completed: samplesAfter >= CALIBRATION_SAMPLES_PER_POINT }
          : point
      )));

      if (samplesAfter >= CALIBRATION_SAMPLES_PER_POINT) {
        window.clearInterval(sampleTimer);
        logGazeDiagnostic('calibration_point_completed', {
          sessionId: sessionIdRef.current,
          pointIndex: activePointIndex,
          pointId: activePoint.id,
          sampleCount: samplesAfter,
        });
        soundFx.playDwellTick();
        setCaptureEpoch((current) => current + 1);
        const localPointPosition = localPointIndexes.indexOf(activePointIndex);
        const isLastLocalPoint = isLocalCalibration
          && localPointPosition >= 0
          && localPointPosition === localPointIndexes.length - 1;
        if (isLastLocalPoint || (!isLocalCalibration && activePointIndex === points.length - 1)) {
          startValidationPhase();
        } else {
          calibrationSamplesRef.current = 0;
          setActivePointIndex((current) => {
            if (!isLocalCalibration) return current + 1;
            return localPointIndexes[localPointPosition + 1] ?? current;
          });
        }
      }
    }, CALIBRATION_SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(sampleTimer);
  }, [
    isOpen,
    phase,
    activePointIndex,
    activePoint?.xPercent,
    activePoint?.yPercent,
    captureReady,
    isLocalCalibration,
    localPointIndexes,
    onRecordPoint,
    participantId,
    points.length,
  ]);

  if (!isOpen) return null;

  const resetValidationState = () => {
    setValidationIndex(0);
    setValidationResult(null);
    setValidationProgress(0);
    validationSamplesRef.current = [];
    validationRawSamplesRef.current = VALIDATION_POINTS.map(() => []);
    validationFilteredSamplesRef.current = VALIDATION_POINTS.map(() => []);
  };

  const resetCalibration = () => {
    setPoints(INITIAL_POINTS);
    setActivePointIndex(0);
    setIsLocalCalibration(false);
    setLocalRegionLabel(null);
    setLocalPointIndexes([]);
    sessionIdRef.current = crypto.randomUUID();
    sessionModeRef.current = 'full';
    calibrationSampleRecordsRef.current = [];
    validationSampleRecordsRef.current = [];
    calibrationSamplesRef.current = 0;
    resetValidationState();
    logGazeDiagnostic('calibration_run_started', {
      sessionId: sessionIdRef.current,
      mode: 'full',
      pointCount: INITIAL_POINTS.length,
      retry: true,
    });
    setPhase('calibrating');
    onBeginPointCalibration();
  };

  const startLocalRecalibration = () => {
    if (!validationResult || validationResult.regionErrors.length === 0) return;

    const candidates = getRecalibrationCandidates(validationResult.regionErrors, validationResult.passed);
    const selectedRegions = candidates.filter((region) => (
      region.sampleCount > 0 && selectedLocalRegionIds.includes(region.id)
    ));
    if (selectedRegions.length === 0) return;
    const selectedPointIndexes = selectedRegions.map((region) => region.calibrationPointIndex);

    setPoints((current) => current.map((point, index) => (
      selectedPointIndexes.includes(index)
        ? { ...point, samplesRemaining: CALIBRATION_SAMPLES_PER_POINT, completed: false }
        : point
    )));
    setActivePointIndex(selectedPointIndexes[0]);
    setLocalPointIndexes(selectedPointIndexes);
    setIsLocalCalibration(true);
    setLocalRegionLabel(selectedRegions.map((region) => region.label).join(', '));
    sessionIdRef.current = crypto.randomUUID();
    sessionModeRef.current = 'local';
    calibrationSampleRecordsRef.current = [];
    validationSampleRecordsRef.current = [];
    calibrationSamplesRef.current = 0;
    resetValidationState();
    setCaptureEpoch((current) => current + 1);
    logGazeDiagnostic('calibration_run_started', {
      sessionId: sessionIdRef.current,
      mode: 'local',
      pointCount: selectedRegions.length,
      pointIndexes: selectedPointIndexes,
      regions: selectedRegions.map((region) => region.label),
    });
    setPhase('calibrating');
    onBeginLocalCalibration();
  };

  const adjustCameraPosition = () => {
    setPhase('setup');
    onCameraPreviewVisible(true, showFaceGuide);
  };

  const renderFaceStatus = () => (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-left ${
      status.tone === 'emerald'
        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
        : status.tone === 'amber'
        ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
        : status.tone === 'sky'
        ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
        : 'border-rose-400/30 bg-rose-400/10 text-rose-100'
    }`}>
      <ScanFace className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <strong className="block text-xs">{status.label}</strong>
        <span className="mt-0.5 block text-[11px] opacity-80">
          {faceStatus === 'stable' && !gazeCoords.isValid
            ? phase === 'setup'
              ? 'Face position stable. Start calibration and follow the targets to initialize gaze estimates.'
              : 'Face position stable. Keep looking at this target while the first gaze samples are collected.'
            : status.detail}
        </span>
        {status.actions.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] opacity-90">
            {status.actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        )}
        {phase !== 'setup' && (
          <span className="mt-2 block text-[10px] opacity-75">
            Gaze estimate: {gazeStabilityLabel(gazeStability)}
          </span>
        )}
        {(faceStatus === 'gaze_unavailable' || faceStatus === 'not_detected') && phase !== 'setup' && (
          <button
            type="button"
            onClick={() => onCameraPreviewVisible(true, showFaceGuide, previewAnchor)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
          >
            <Camera className="h-3.5 w-3.5" />
            Show camera preview
          </button>
        )}
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="relative z-10 mx-auto mt-10 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900/95 p-7 text-center text-white shadow-2xl">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
        <Camera className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-2xl font-bold">Set up your camera position</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">
        Face the screen comfortably and keep both eyes visible. The guide is a soft reference, not a strict head lock.
      </p>
      <div className="mt-5">{renderFaceStatus()}</div>
      <div className="mt-3 grid gap-2 text-left text-xs text-slate-300 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">Keep your head roughly still while looking at each target.</div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">Small natural movements and blinking are okay.</div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">Use steady lighting and avoid strong backlight.</div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">The moving gaze marker is an estimate and may jitter.</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showFaceGuide}
        onClick={() => setShowFaceGuide((current) => !current)}
        className="mx-auto mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${showFaceGuide ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        <span>Soft face guide {showFaceGuide ? 'on' : 'off'}</span>
      </button>
      <button
        type="button"
        onClick={beginPointCalibration}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
      >
        <Target className="h-4 w-4" />
        Begin 9-point calibration
      </button>
    </div>
  );

  const renderCalibration = () => (
    <>
      <div className="relative z-10 mx-auto mt-5 w-full max-w-xl px-5 text-center text-white">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/90 px-3.5 py-1.5 text-xs font-semibold">
          <Target className="h-4 w-4 text-emerald-400" />
          <span>{isLocalCalibration
            ? `Local recalibration · ${localRegionLabel} · point ${visiblePointPosition + 1} of ${visiblePointIndexes.length}`
            : `Calibration point ${activePointIndex + 1} of ${points.length}`}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold sm:text-2xl">Look at the target while samples are collected automatically</h2>
        <p className="mt-1 text-xs text-slate-400">Hold a comfortable gaze for about two seconds. The system records {CALIBRATION_SAMPLES_PER_POINT} stable samples without clicking.</p>
        <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
          <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${calibrationProgress}%` }} />
        </div>
        <span className="mt-1 block font-mono text-[11px] text-slate-400">{completedCount} / {points.length} points complete</span>
        <div className="mx-auto mt-3 max-w-sm">{renderFaceStatus()}</div>
        <div className="mx-auto mt-2 h-1.5 w-52 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-sky-400 transition-[width] duration-100" style={{ width: `${stabilityProgress * 100}%` }} />
        </div>
        <span className="mt-1 block text-[10px] text-slate-500">
          {captureReady ? 'Stable sample ready' : 'Stabilizing camera position...'}
        </span>
      </div>

      {activePoint && (
        <div
          aria-label={`Calibration target ${activePointIndex + 1}. ${isTargetAligned ? 'Aligned' : 'Look here'}`}
          role="status"
          style={{
            left: `${activePoint.xPercent}%`,
            top: `${activePoint.yPercent}%`,
            transform: 'translate(-50%, -50%)',
          }}
          className={`calibration-target-breathe absolute z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 text-sm font-extrabold text-white transition-colors ${
            isTargetAligned
              ? 'calibration-target-breathe--blue border-blue-100 bg-blue-600/95 ring-8 ring-blue-400/25'
              : 'calibration-target-breathe--red border-red-100 bg-red-600/95 ring-8 ring-red-400/25'
          }`}
        >
          {activePoint.samplesRemaining}
        </div>
      )}
    </>
  );

  const renderValidation = () => (
    <>
      <div className="relative z-10 mx-auto mt-5 w-full max-w-xl px-5 text-center text-white">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/90 px-3.5 py-1.5 text-xs font-semibold">
          <Eye className="h-4 w-4 text-sky-300" />
          <span>Independent accuracy check</span>
        </div>
        <h2 className="mt-3 text-xl font-bold sm:text-2xl">Calibration sample quality check</h2>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-400">
          Look at each target without clicking. The system waits for a stable position and filters isolated prediction errors before calculating the result.
        </p>
        <span className="mt-3 block font-mono text-[11px] text-slate-400">Validation point {validationIndex + 1} of {VALIDATION_POINTS.length}</span>
        <span className={`mt-1 block text-xs font-semibold ${isCollecting ? 'text-emerald-300' : 'text-amber-300'}`}>
          {isCollecting
            ? `Collecting stable samples... ${Math.round(validationProgress * 100)}%`
            : 'Stabilizing target...'}
        </span>
        <div className="mx-auto mt-3 max-w-sm">{renderFaceStatus()}</div>
        <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
          <div
            className="h-full bg-emerald-400 transition-[width] duration-75"
            style={{ width: `${validationProgress * 100}%` }}
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          left: `${validationTarget.xPercent}%`,
          top: `${validationTarget.yPercent}%`,
          transform: 'translate(-50%, -50%)',
        }}
        className={`absolute z-10 h-16 w-16 rounded-full border-4 ${isCollecting ? 'border-emerald-300 bg-emerald-500/80' : 'border-sky-300 bg-sky-500/80'} shadow-xl ring-8 ring-white/10`}
      />
    </>
  );

  const renderRegionError = (region: CalibrationRegionError) => (
    <div key={region.id} className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-200">{region.label}</span>
        <span className="text-[10px] font-mono text-slate-500">{region.sampleCount} samples</span>
      </div>
      {region.sampleCount === 0 ? (
        <p className="mt-2 text-xs text-slate-400">N/A · insufficient samples</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="block text-slate-500">Median Error</span>
          <strong className="mt-0.5 block font-mono text-sm text-white">{Math.round(region.medianErrorPx)} px</strong>
        </div>
        <div>
          <span className="block text-slate-500">Within Tolerance</span>
        <strong className={`mt-0.5 block font-mono text-sm ${region.withinTolerancePercent >= validationMetrics.passWithinTolerancePercent ? 'text-emerald-300' : 'text-amber-300'}`}>
            {Math.round(region.withinTolerancePercent)}%
          </strong>
        </div>
        </div>
      )}
    </div>
  );

  const renderResult = () => {
    if (!validationResult) return null;
    const passed = validationResult.passed;
    const weakRegions = getWeakCalibrationRegions(validationResult.regionErrors);
    const localCandidates = getRecalibrationCandidates(validationResult.regionErrors, passed);
    const selectedLocalCandidates = localCandidates.filter((region) => selectedLocalRegionIds.includes(region.id));
    const canRecalibrateLocally = selectedLocalCandidates.length > 0;
    return (
      <div className="relative z-10 mx-auto mt-8 mb-24 w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-center text-white shadow-2xl sm:p-7">
        {passed ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
        ) : (
          <CircleAlert className="mx-auto h-12 w-12 text-amber-400" />
        )}
        <h2 className="mt-4 text-2xl font-bold">{passed ? 'Calibration passed' : 'Calibration needs improvement'}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {passed
            ? 'Calibration meets the 65% minimum. You can still improve the weakest regions before tracking.'
            : canRecalibrateLocally
            ? `${weakRegions.length} region${weakRegions.length === 1 ? '' : 's'} need improvement. Select one or more weak regions for local recalibration, or repeat all 9 points.`
            : 'Several regions need improvement. Select weak regions for local recalibration, or repeat the complete 9-point calibration.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Samples kept</span>
            <strong className="mt-1 block font-mono text-sm">{validationResult.validSampleCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Median Error</span>
            <strong className="mt-1 block font-mono text-sm">{Math.round(validationResult.medianErrorPx)} px</strong>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Within Tolerance</span>
            <strong className="mt-1 block font-mono text-sm">{Math.round(validationResult.withinTolerancePercent)}%</strong>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Filtered</span>
            <strong className="mt-1 block font-mono text-sm">{validationResult.discardedSampleCount}</strong>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Raw samples: {validationResult.rawSampleCount}. Tolerance is scaled to the shorter screen dimension.
        </p>
        <div className="mt-5 text-left">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Regional accuracy</h3>
            <span className="text-[10px] text-slate-500">Lower error is better</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {validationResult.regionErrors.map(renderRegionError)}
          </div>
        </div>
        {!passed && localCandidates.length > 0 && (
          <div className="mt-5 rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Choose local recalibration points</h3>
              <span className="text-[10px] text-slate-500">Sorted from weakest to strongest</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">The selected points are recalibrated sequentially while the other calibration data remains in the WebGazer model.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {localCandidates.map((region) => (
                <label key={region.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-700 bg-slate-900/70 p-2 text-xs text-slate-200 hover:border-sky-400/60">
                  <input
                    type="checkbox"
                    checked={selectedLocalRegionIds.includes(region.id)}
                    onChange={() => setSelectedLocalRegionIds((current) => (
                      current.includes(region.id)
                        ? current.filter((id) => id !== region.id)
                        : [...current, region.id]
                    ))}
                    className="mt-0.5 accent-sky-400"
                  />
                  <span>
                    <strong className="block">{region.label}</strong>
                    <span className="text-[10px] text-slate-400">Median {Math.round(region.medianErrorPx)} px · {Math.round(region.withinTolerancePercent)}% within tolerance</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {passed && localCandidates.length > 0 && (
          <div className="mt-5 rounded-lg border border-sky-400/20 bg-sky-400/5 p-3 text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-200">Optional accuracy improvement</h3>
            <p className="mt-1 text-xs text-slate-400">A passing result is usable, but you can recalibrate one or more regions to try to reduce the remaining error.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {localCandidates.map((region) => (
                <label key={region.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-700 bg-slate-900/70 p-2 text-xs text-slate-200 hover:border-sky-400/60">
                  <input
                    type="checkbox"
                    checked={selectedLocalRegionIds.includes(region.id)}
                    onChange={() => setSelectedLocalRegionIds((current) => (
                      current.includes(region.id)
                        ? current.filter((id) => id !== region.id)
                        : [...current, region.id]
                    ))}
                    className="mt-0.5 accent-sky-400"
                  />
                  <span>
                    <strong className="block">{region.label}</strong>
                    <span className="text-[10px] text-slate-400">Median {Math.round(region.medianErrorPx)} px · {Math.round(region.withinTolerancePercent)}% within tolerance</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={adjustCameraPosition}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <Camera className="h-4 w-4" />
            Adjust camera
          </button>
          {localCandidates.length > 0 && canRecalibrateLocally && (
            <button
              type="button"
              onClick={startLocalRecalibration}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300"
            >
              <Target className="h-4 w-4" />
              Recalibrate selected ({selectedLocalCandidates.length})
            </button>
          )}
          <button
            type="button"
            onClick={resetCalibration}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Retry all 9 points
          </button>
          <button
            type="button"
            onClick={onFinish}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${passed ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'}`}
          >
            {passed ? 'Use calibration and start tracking' : 'Continue with current calibration'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 select-none overflow-y-auto bg-slate-950/95 text-white backdrop-blur-md">
      {phase === 'setup' && renderSetup()}
      {phase === 'calibrating' && renderCalibration()}
      {phase === 'validating' && renderValidation()}
      {phase === 'result' && renderResult()}

      <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-slate-800 bg-slate-950/90 p-4 text-xs text-slate-400 sm:p-5">
        <span>
          {phase === 'setup' && 'The soft face guide is optional and appears only during camera setup.'}
          {phase === 'calibrating' && 'Each label uses a new eye-feature frame while face position is stable.'}
          {phase === 'validating' && 'Look at each target for up to 4.2 seconds. No clicks are required.'}
          {phase === 'result' && 'Regional metrics help identify where a local recalibration is useful.'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
};
