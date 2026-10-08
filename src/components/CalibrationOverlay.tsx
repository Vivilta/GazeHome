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
  Target,
  X,
} from 'lucide-react';
import { CalibrationResult, GazeCoordinates } from '../types';
import { soundFx } from '../utils/audio';

interface CalibrationOverlayProps {
  isOpen: boolean;
  gazeCoords: GazeCoordinates;
  onBeginPointCalibration: () => void;
  onStartValidation: () => void;
  onValidationComplete: (result: CalibrationResult) => void;
  onCameraPreviewVisible: (visible: boolean) => void;
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

type CalibrationPhase = 'setup' | 'calibrating' | 'validating' | 'result';

// WebGazer's reference calibration uses five samples per target. More samples
// make each screen region less sensitive to a single noisy webcam prediction.
const CLICKS_PER_POINT = 5;
const VALIDATION_SETTLE_MS = 800;
const VALIDATION_COLLECTION_MS = 3000;
const VALIDATION_POINTS = [
  { xPercent: 18, yPercent: 18 },
  { xPercent: 82, yPercent: 18 },
  { xPercent: 50, yPercent: 50 },
  { xPercent: 18, yPercent: 82 },
  { xPercent: 82, yPercent: 82 },
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

function calculateMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  isOpen,
  gazeCoords,
  onBeginPointCalibration,
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

  const validationSamplesRef = useRef<number[]>([]);
  const validationErrorsRef = useRef<number[]>([]);
  const collectingRef = useRef(false);
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
    validationSamplesRef.current = [];
    validationErrorsRef.current = [];
    collectingRef.current = false;
  }, [isOpen]);

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

      const pointSamples = validationSamplesRef.current;
      validationErrorsRef.current.push(...pointSamples);

      if (validationIndex < VALIDATION_POINTS.length - 1) {
        setValidationIndex((current) => current + 1);
        return;
      }

      const errors = validationErrorsRef.current;
      const validSampleCount = errors.length;
      const tolerancePx = Math.min(window.innerWidth, window.innerHeight) * 0.16;
      const meanErrorPx = validSampleCount > 0
        ? errors.reduce((sum, error) => sum + error, 0) / validSampleCount
        : 0;
      const medianErrorPx = calculateMedian(errors);
      const withinTolerancePercent = validSampleCount > 0
        ? (errors.filter((error) => error <= tolerancePx).length / validSampleCount) * 100
        : 0;
      const result: CalibrationResult = {
        validSampleCount,
        meanErrorPx,
        medianErrorPx,
        withinTolerancePercent,
        passed: validSampleCount >= 20 && medianErrorPx <= Math.min(window.innerWidth, window.innerHeight) * 0.2 && withinTolerancePercent >= 60,
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
    if (!isOpen || phase !== 'validating' || !collectingRef.current || !gazeCoords.isValid) {
      return;
    }

    const target = getScreenPoint(VALIDATION_POINTS[validationIndex]);
    const distance = Math.hypot(gazeCoords.x - target.x, gazeCoords.y - target.y);
    if (Number.isFinite(distance)) {
      validationSamplesRef.current.push(distance);
    }
  }, [gazeCoords, isOpen, phase, validationIndex]);

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

  const beginPointCalibration = () => {
    onCameraPreviewVisible(false);
    setPhase('calibrating');
    onBeginPointCalibration();
  };

  const handlePointClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (phase !== 'calibrating' || !activePoint) return;

    const target = getScreenPoint(activePoint);
    onRecordPoint(target.x, target.y);
    soundFx.playDwellTick();

    const clicksAfter = Math.max(0, activePoint.clicksRemaining - 1);
    setPoints((current) => current.map((point, index) => (
      index === activePointIndex
        ? { ...point, clicksRemaining: clicksAfter, completed: clicksAfter === 0 }
        : point
    )));

    if (clicksAfter === 0) {
      if (activePointIndex === points.length - 1) {
        soundFx.playSelectSuccess();
        setValidationIndex(0);
        setPhase('validating');
        onStartValidation();
      } else {
        setActivePointIndex((current) => current + 1);
      }
    }
  };

  const resetCalibration = () => {
    setPoints(INITIAL_POINTS);
    setActivePointIndex(0);
    setValidationIndex(0);
    setValidationResult(null);
    setValidationProgress(0);
    validationSamplesRef.current = [];
    validationErrorsRef.current = [];
    setPhase('calibrating');
    onBeginPointCalibration();
  };

  const adjustCameraPosition = () => {
    onCameraPreviewVisible(true);
    setPhase('setup');
  };

  const renderSetup = () => (
    <div className="relative z-10 mx-auto mt-16 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900/95 p-7 text-center text-white shadow-2xl">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
        <Camera className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-2xl font-bold">Set up your camera position</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">
        Make sure your face and both eyes are visible in the camera preview. Sit at a comfortable distance and face the screen.
      </p>
      <div className="mt-5 grid gap-2 text-left text-xs text-slate-300 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">Keep your head roughly still while looking at each target.</div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">Small natural movements and blinking are okay.</div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">Use steady lighting and avoid strong backlight.</div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">The moving gaze marker is an estimate and may jitter.</div>
      </div>
      <button
        type="button"
        onClick={beginPointCalibration}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
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
          <span>Calibration point {activePointIndex + 1} of {points.length}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold sm:text-2xl">Look at the target and click it {CLICKS_PER_POINT} times</h2>
        <p className="mt-1 text-xs text-slate-400">Keep your head roughly still for a moment. Small natural movements and blinking are okay.</p>
        <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
          <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${calibrationProgress}%` }} />
        </div>
        <span className="mt-1 block font-mono text-[11px] text-slate-400">{completedCount} / {points.length} points complete</span>
      </div>

      {activePoint && (
        <button
          type="button"
          aria-label={`Calibration target ${activePointIndex + 1}`}
          onClick={handlePointClick}
          style={{
            left: `${activePoint.xPercent}%`,
            top: `${activePoint.yPercent}%`,
            transform: 'translate(-50%, -50%)',
          }}
          className="absolute z-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-sm font-extrabold text-white shadow-xl shadow-blue-500/40 ring-8 ring-blue-400/20 transition-transform hover:scale-105 active:scale-95"
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
        <h2 className="mt-3 text-xl font-bold sm:text-2xl">9-point calibration complete</h2>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-400">
          This is a separate 5-point accuracy check, not another calibration step. Look at each target without clicking until the progress bar is complete.
        </p>
        <span className="mt-3 block font-mono text-[11px] text-slate-400">Validation point {validationIndex + 1} of {VALIDATION_POINTS.length}</span>
        <span className={`mt-1 block text-xs font-semibold ${isCollecting ? 'text-emerald-300' : 'text-amber-300'}`}>
          {isCollecting
            ? `Collecting gaze samples... ${Math.max(0, Math.ceil((1 - validationProgress) * (VALIDATION_COLLECTION_MS / 1000)))}s`
            : 'Stabilizing target...'}
        </span>
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

  const renderResult = () => {
    if (!validationResult) return null;
    const passed = validationResult.passed;
    return (
      <div className="relative z-10 mx-auto mt-16 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/95 p-7 text-center text-white shadow-2xl">
        {passed ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
        ) : (
          <CircleAlert className="mx-auto h-12 w-12 text-amber-400" />
        )}
        <h2 className="mt-4 text-2xl font-bold">{passed ? 'Calibration passed' : 'Calibration needs improvement'}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {passed
            ? 'The estimated gaze was stable enough for the four appliance regions.'
            : 'Some gaze samples were too far from the validation targets. Recalibrate after adjusting your position if needed.'}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Tolerance is scaled to the shorter screen dimension. Webcam validation is an estimate, not laboratory ground truth.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2 text-left">
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Samples</span>
            <strong className="mt-1 block font-mono text-sm">{validationResult.validSampleCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Median error</span>
            <strong className="mt-1 block font-mono text-sm">{Math.round(validationResult.medianErrorPx)} px</strong>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-2.5">
            <span className="block text-[10px] uppercase text-slate-400">Within {Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.16)} px</span>
            <strong className="mt-1 block font-mono text-sm">{Math.round(validationResult.withinTolerancePercent)}%</strong>
          </div>
        </div>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={adjustCameraPosition}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <Camera className="h-4 w-4" />
            Adjust camera
          </button>
          {!passed && (
            <button
              type="button"
              onClick={resetCalibration}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" />
              Retry calibration
            </button>
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
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-slate-950/95 text-white backdrop-blur-md">
      {phase === 'setup' && renderSetup()}
      {phase === 'calibrating' && renderCalibration()}
      {phase === 'validating' && renderValidation()}
      {phase === 'result' && renderResult()}

      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-slate-800 bg-slate-950/90 p-5 text-xs text-slate-400">
        <span>
          {phase === 'setup' && 'Camera preview is shown only during setup.'}
          {phase === 'calibrating' && 'The target is shown one at a time to reduce accidental clicks.'}
          {phase === 'validating' && 'Accuracy check only: each target is shown for about 3.8 seconds. No clicks are required.'}
          {phase === 'result' && 'Calibration quality is based on measured validation samples.'}
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
