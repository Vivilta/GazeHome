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
  CalibrationResult,
  FaceTrackingStatus,
  GazeCoordinates,
} from '../types';
import { soundFx } from '../utils/audio';

interface CalibrationOverlayProps {
  isOpen: boolean;
  gazeCoords: GazeCoordinates;
  faceStatus: FaceTrackingStatus;
  onBeginPointCalibration: () => void;
  onBeginLocalCalibration: () => void;
  onStartValidation: () => void;
  onValidationComplete: (result: CalibrationResult) => void;
  onCameraPreviewVisible: (visible: boolean, showFaceGuide?: boolean) => void;
  onFinish: () => void;
  onCancel: () => void;
  onRecordPoint: (x: number, y: number) => void;
}

interface PointState {
  id: number;
  xPercent: number;
  yPercent: number;
  clicksRemaining: number;
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

const CLICKS_PER_POINT = 5;
const CALIBRATION_STABLE_WAIT_MS = 650;
const VALIDATION_SETTLE_MS = 1000;
const VALIDATION_COLLECTION_MS = 3200;
const VALIDATION_POINTS: ValidationPoint[] = [
  { id: 'top-left', label: 'Top left', xPercent: 18, yPercent: 18, calibrationPointIndex: 0 },
  { id: 'top-right', label: 'Top right', xPercent: 82, yPercent: 18, calibrationPointIndex: 2 },
  { id: 'center', label: 'Center', xPercent: 50, yPercent: 50, calibrationPointIndex: 4 },
  { id: 'bottom-left', label: 'Bottom left', xPercent: 18, yPercent: 82, calibrationPointIndex: 6 },
  { id: 'bottom-right', label: 'Bottom right', xPercent: 82, yPercent: 82, calibrationPointIndex: 8 },
];

const INITIAL_POINTS: PointState[] = [
  { id: 1, xPercent: 10, yPercent: 12, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 2, xPercent: 50, yPercent: 12, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 3, xPercent: 90, yPercent: 12, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 4, xPercent: 10, yPercent: 50, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 5, xPercent: 50, yPercent: 50, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 6, xPercent: 90, yPercent: 50, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 7, xPercent: 10, yPercent: 88, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 8, xPercent: 50, yPercent: 88, clicksRemaining: CLICKS_PER_POINT, completed: false },
  { id: 9, xPercent: 90, yPercent: 88, clicksRemaining: CLICKS_PER_POINT, completed: false },
];

function getScreenPoint(point: { xPercent: number; yPercent: number }) {
  return {
    x: (window.innerWidth * point.xPercent) / 100,
    y: (window.innerHeight * point.yPercent) / 100,
  };
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
  if (values.length < 8) return values;

  const median = calculateMedian(values);
  const deviations = values.map((value) => Math.abs(value - median));
  const mad = calculateMedian(deviations);
  const threshold = Math.max(45, mad * 3.5);
  const filtered = values.filter((value) => Math.abs(value - median) <= threshold);

  // Keep enough evidence for the validation result even when a noisy camera
  // produces an unusually tight MAD estimate.
  return filtered.length >= Math.max(5, Math.floor(values.length * 0.5))
    ? filtered
    : values;
}

function faceStatusCopy(status: FaceTrackingStatus) {
  switch (status) {
    case 'stable':
      return { label: 'Position stable', detail: 'The camera view is stable enough to collect a sample.', tone: 'emerald' };
    case 'moving':
      return { label: 'Position moving', detail: 'Pause your head movement briefly; natural blinking is okay.', tone: 'amber' };
    case 'detected':
      return { label: 'Face detected', detail: 'Hold this position for a moment before continuing.', tone: 'sky' };
    case 'not_detected':
    default:
      return { label: 'Face not detected', detail: 'Make sure your face and both eyes are visible.', tone: 'rose' };
  }
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  isOpen,
  gazeCoords,
  faceStatus,
  onBeginPointCalibration,
  onBeginLocalCalibration,
  onStartValidation,
  onValidationComplete,
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

  const validationSamplesRef = useRef<number[]>([]);
  const validationRawSamplesRef = useRef<number[][]>(VALIDATION_POINTS.map(() => []));
  const validationFilteredSamplesRef = useRef<number[][]>(VALIDATION_POINTS.map(() => []));
  const collectingRef = useRef(false);
  const stableSinceRef = useRef<number | null>(null);
  const onValidationCompleteRef = useRef(onValidationComplete);

  useEffect(() => {
    onValidationCompleteRef.current = onValidationComplete;
  }, [onValidationComplete]);

  useEffect(() => {
    if (!isOpen) return;
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
    validationSamplesRef.current = [];
    validationRawSamplesRef.current = VALIDATION_POINTS.map(() => []);
    validationFilteredSamplesRef.current = VALIDATION_POINTS.map(() => []);
    collectingRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    onCameraPreviewVisible(phase === 'setup', showFaceGuide);
  }, [isOpen, phase, showFaceGuide, onCameraPreviewVisible]);

  useEffect(() => {
    if (!isOpen || phase !== 'calibrating') return;

    stableSinceRef.current = null;
    setCaptureReady(false);
    setStabilityProgress(0);
    let animationFrameId = 0;

    const updateStability = () => {
      const stable = faceStatus === 'stable' && gazeCoords.isValid;
      if (stable) {
        if (stableSinceRef.current === null) {
          stableSinceRef.current = performance.now();
        }
        const elapsed = performance.now() - stableSinceRef.current;
        const progress = Math.min(1, elapsed / CALIBRATION_STABLE_WAIT_MS);
        setStabilityProgress(progress);
        setCaptureReady(progress >= 1);
      } else {
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
    let animationFrameId = 0;

    const finishValidationPoint = () => {
      collectingRef.current = false;
      setIsCollecting(false);
      setValidationProgress(1);

      const rawPointSamples = validationSamplesRef.current;
      const filteredPointSamples = filterOutlierErrors(rawPointSamples);
      validationRawSamplesRef.current[validationIndex] = rawPointSamples;
      validationFilteredSamplesRef.current[validationIndex] = filteredPointSamples;

      if (validationIndex < VALIDATION_POINTS.length - 1) {
        setValidationIndex((current) => current + 1);
        return;
      }

      const tolerancePx = Math.min(window.innerWidth, window.innerHeight) * 0.16;
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
        passed: validSampleCount >= 20
          && medianErrorPx <= Math.min(window.innerWidth, window.innerHeight) * 0.2
          && withinTolerancePercent >= 60,
      };

      setValidationResult(result);
      setPhase('result');
      onValidationCompleteRef.current(result);
    };

    const updateValidationProgress = () => {
      const elapsed = performance.now() - startedAt;

      if (elapsed >= VALIDATION_SETTLE_MS && !collectionStarted) {
        collectionStarted = true;
        collectingRef.current = true;
        setIsCollecting(true);
      }

      const progress = Math.min(
        1,
        Math.max(0, (elapsed - VALIDATION_SETTLE_MS) / VALIDATION_COLLECTION_MS),
      );
      setValidationProgress(progress);

      if (elapsed >= VALIDATION_SETTLE_MS + VALIDATION_COLLECTION_MS) {
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
  }, [isOpen, phase, validationIndex]);

  useEffect(() => {
    if (!isOpen || phase !== 'validating' || !collectingRef.current || !gazeCoords.isValid || faceStatus !== 'stable') {
      return;
    }

    const target = getScreenPoint(VALIDATION_POINTS[validationIndex]);
    const distance = Math.hypot(gazeCoords.x - target.x, gazeCoords.y - target.y);
    if (Number.isFinite(distance)) {
      validationSamplesRef.current.push(distance);
    }
  }, [gazeCoords, isOpen, phase, validationIndex, faceStatus]);

  if (!isOpen) return null;

  const activePoint = points[activePointIndex];
  const completedCount = points.filter((point) => point.completed).length;
  const completedClicks = points.reduce(
    (total, point) => total + (CLICKS_PER_POINT - point.clicksRemaining),
    0,
  );
  const totalClicks = INITIAL_POINTS.length * CLICKS_PER_POINT;
  const calibrationProgress = Math.round((completedClicks / totalClicks) * 100);
  const validationTarget = VALIDATION_POINTS[validationIndex];
  const status = faceStatusCopy(faceStatus);

  const startValidationPhase = () => {
    soundFx.playSelectSuccess();
    setValidationIndex(0);
    setPhase('validating');
    onStartValidation();
  };

  const beginPointCalibration = () => {
    setIsLocalCalibration(false);
    setLocalRegionLabel(null);
    onCameraPreviewVisible(false);
    setPhase('calibrating');
    onBeginPointCalibration();
  };

  const handlePointClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (phase !== 'calibrating' || !activePoint || !captureReady) return;

    const target = getScreenPoint(activePoint);
    onRecordPoint(target.x, target.y);
    soundFx.playDwellTick();
    setCaptureEpoch((current) => current + 1);

    const clicksAfter = Math.max(0, activePoint.clicksRemaining - 1);
    setPoints((current) => current.map((point, index) => (
      index === activePointIndex
        ? { ...point, clicksRemaining: clicksAfter, completed: clicksAfter === 0 }
        : point
    )));

    if (clicksAfter === 0) {
      if (isLocalCalibration || activePointIndex === points.length - 1) {
        startValidationPhase();
      } else {
        setActivePointIndex((current) => current + 1);
      }
    }
  };

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
    resetValidationState();
    setPhase('calibrating');
    onCameraPreviewVisible(false);
    onBeginPointCalibration();
  };

  const startLocalRecalibration = () => {
    if (!validationResult || validationResult.regionErrors.length === 0) return;

    const weakestRegion = [...validationResult.regionErrors].sort((a, b) => {
      if (b.medianErrorPx !== a.medianErrorPx) return b.medianErrorPx - a.medianErrorPx;
      return a.withinTolerancePercent - b.withinTolerancePercent;
    })[0];

    setPoints((current) => current.map((point, index) => (
      index === weakestRegion.calibrationPointIndex
        ? { ...point, clicksRemaining: CLICKS_PER_POINT, completed: false }
        : point
    )));
    setActivePointIndex(weakestRegion.calibrationPointIndex);
    setIsLocalCalibration(true);
    setLocalRegionLabel(weakestRegion.label);
    resetValidationState();
    setCaptureEpoch((current) => current + 1);
    setPhase('calibrating');
    onCameraPreviewVisible(false);
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
        <span className="mt-0.5 block text-[11px] opacity-80">{status.detail}</span>
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
          <span>{isLocalCalibration ? `Local recalibration · ${localRegionLabel}` : `Calibration point ${activePointIndex + 1} of ${points.length}`}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold sm:text-2xl">Look at the target and capture {CLICKS_PER_POINT} stable samples</h2>
        <p className="mt-1 text-xs text-slate-400">Wait for Position stable before each click. The system rejects samples while the camera estimate is moving.</p>
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
        <button
          type="button"
          aria-label={`Calibration target ${activePointIndex + 1}`}
          onClick={handlePointClick}
          disabled={!captureReady}
          style={{
            left: `${activePoint.xPercent}%`,
            top: `${activePoint.yPercent}%`,
            transform: 'translate(-50%, -50%)',
          }}
          className={`absolute z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white text-sm font-extrabold text-white shadow-xl transition-all ${
            captureReady
              ? 'bg-blue-600 shadow-blue-500/40 ring-8 ring-blue-400/20 hover:scale-105 active:scale-95'
              : 'cursor-not-allowed bg-slate-600/80 opacity-70 ring-4 ring-slate-400/10'
          }`}
        >
          {activePoint.clicksRemaining}
        </button>
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
            ? `Collecting stable samples... ${Math.max(0, Math.ceil((1 - validationProgress) * (VALIDATION_COLLECTION_MS / 1000)))}s`
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
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="block text-slate-500">Median Error</span>
          <strong className="mt-0.5 block font-mono text-sm text-white">{Math.round(region.medianErrorPx)} px</strong>
        </div>
        <div>
          <span className="block text-slate-500">Within Tolerance</span>
          <strong className={`mt-0.5 block font-mono text-sm ${region.withinTolerancePercent >= 60 ? 'text-emerald-300' : 'text-amber-300'}`}>
            {Math.round(region.withinTolerancePercent)}%
          </strong>
        </div>
      </div>
    </div>
  );

  const renderResult = () => {
    if (!validationResult) return null;
    const passed = validationResult.passed;
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
            ? 'The estimated gaze was stable enough for the four appliance regions.'
            : 'The weakest region is shown below. You can recalibrate only that region or repeat the complete 9-point calibration.'}
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
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={adjustCameraPosition}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <Camera className="h-4 w-4" />
            Adjust camera
          </button>
          {!passed && (
            <>
              <button
                type="button"
                onClick={startLocalRecalibration}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300"
              >
                <Target className="h-4 w-4" />
                Recalibrate weakest region
              </button>
              <button
                type="button"
                onClick={resetCalibration}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
                Retry all 9 points
              </button>
            </>
          )}
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
          {phase === 'calibrating' && 'Each sample is recorded only after the camera estimate is stable.'}
          {phase === 'validating' && 'Look at each target for about 4.2 seconds. No clicks are required.'}
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
