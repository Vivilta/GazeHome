/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DeviceType,
  DeviceState,
  DevicesMap,
  AppMode,
  DwellTimeOption,
  ExperimentCommand,
  TrialRecord,
  SurveyData,
} from './types';
import { useGazeTracker } from './hooks/useGazeTracker';
import { useDwellSelection } from './hooks/useDwellSelection';
import { Header } from './components/Header';
import { ActiveCommandBanner } from './components/ActiveCommandBanner';
import { ApplianceGrid } from './components/ApplianceGrid';
import { ControlPanel } from './components/ControlPanel';
import { ExperimentPanel } from './components/ExperimentPanel';
import { GazeReticle } from './components/GazeReticle';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { SurveyModal } from './components/SurveyModal';
import { soundFx } from './utils/audio';

const INITIAL_DEVICES: DevicesMap = {
  LIGHT: 'OFF',
  FAN: 'OFF',
  TV: 'OFF',
  AC: 'OFF',
};

const DEVICE_LIST: DeviceType[] = ['LIGHT', 'FAN', 'TV', 'AC'];

export default function App() {
  // 1. Application Mode & Appliance States
  const [mode, setMode] = useState<AppMode>('manual');
  const [devices, setDevices] = useState<DevicesMap>(INITIAL_DEVICES);
  const [dwellTime, setDwellTime] = useState<DwellTimeOption>(1.0);
  const [participantId, setParticipantId] = useState<string>('P01');

  // 2. Experiment Flow State
  const [currentCommand, setCurrentCommand] = useState<ExperimentCommand | null>(null);
  const [isExperimentRunning, setIsExperimentRunning] = useState<boolean>(false);
  const [isExperimentPaused, setIsExperimentPaused] = useState<boolean>(false);
  const [isCommandTransitioning, setIsCommandTransitioning] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const [trials, setTrials] = useState<TrialRecord[]>([]);
  const [surveys, setSurveys] = useState<SurveyData[]>([]);
  const [isSurveyOpen, setIsSurveyOpen] = useState<boolean>(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [trialFeedback, setTrialFeedback] = useState<{
    type: 'success' | 'error' | null;
    message: string | null;
  }>({ type: null, message: null });

  // Refs for precise asynchronous event timing and state consistency
  const commandStartTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const currentCommandRef = useRef<ExperimentCommand | null>(null);
  const isExperimentRunningRef = useRef<boolean>(false);
  const isExperimentPausedRef = useRef<boolean>(false);
  const isCommandTransitioningRef = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<number | null>(null);
  const devicesRef = useRef<DevicesMap>(devices);

  useEffect(() => {
    currentCommandRef.current = currentCommand;
  }, [currentCommand]);

  useEffect(() => {
    isExperimentRunningRef.current = isExperimentRunning;
  }, [isExperimentRunning]);

  useEffect(() => {
    isExperimentPausedRef.current = isExperimentPaused;
  }, [isExperimentPaused]);

  useEffect(() => {
    isCommandTransitioningRef.current = isCommandTransitioning;
  }, [isCommandTransitioning]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // 3. Gaze Tracker Hook
  const {
    trackingStatus,
    faceStatus,
    errorMessage,
    gazeCoords,
    showGazeDot,
    setShowGazeDot,
    isDemoSimulation,
    setIsDemoSimulation,
    startTracking,
    stopTracking,
    startCalibration,
    startLocalCalibration,
    startValidation,
    finishCalibration,
    cancelCalibration,
    recordCalibrationPoint,
    setCameraPreviewVisible,
  } = useGazeTracker();

  // Helper to generate a new randomized command for experiment mode
  const generateNextCommand = useCallback((): ExperimentCommand => {
    const randomDevice = DEVICE_LIST[Math.floor(Math.random() * DEVICE_LIST.length)];
    const currentState = devicesRef.current[randomDevice];
    const targetState: DeviceState = currentState === 'ON' ? 'OFF' : 'ON';

    return {
      id: crypto.randomUUID(),
      targetDevice: randomDevice,
      requestedState: targetState,
      displayText: `Turn ${targetState} the ${randomDevice}`,
    };
  }, []);

  // Live Stopwatch Effect with accurate pause accounting
  useEffect(() => {
    let animId: number;

    if (
      isExperimentRunning &&
      !isExperimentPaused &&
      currentCommand &&
      !isCommandTransitioning
    ) {
      const update = () => {
        const currentLeg = Math.max(0, (performance.now() - commandStartTimeRef.current) / 1000);
        setElapsedTime(accumulatedTimeRef.current + currentLeg);
        animId = requestAnimationFrame(update);
      };
      animId = requestAnimationFrame(update);
    } else if (isExperimentPaused) {
      setElapsedTime(accumulatedTimeRef.current);
    } else if (!isExperimentRunning) {
      setElapsedTime(0);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isExperimentRunning, isExperimentPaused, currentCommand, isCommandTransitioning]);

  // 4. Central Target Selection Handler (used by both Gaze Dwell and Direct Mouse Click)
  const handleSelectDevice = useCallback(
    (device: DeviceType) => {
      if (mode === 'manual') {
        // In Manual mode: toggle target device state
        setDevices((prev) => {
          const nextState: DeviceState = prev[device] === 'ON' ? 'OFF' : 'ON';
          return { ...prev, [device]: nextState };
        });
        return;
      }

      // EXPERIMENT MODE LOGIC
      // 1. If experiment is paused: REJECT selection immediately
      if (isExperimentPausedRef.current) {
        return;
      }

      // 2. If experiment is not running or no active command: REJECT
      if (!isExperimentRunningRef.current || !currentCommandRef.current) {
        return;
      }

      // 3. If transitioning to next command: REJECT to prevent old command duplicate submission
      if (isCommandTransitioningRef.current) {
        return;
      }

      const cmd = currentCommandRef.current;
      const now = performance.now();
      const currentLegSeconds = Math.max(0, (now - commandStartTimeRef.current) / 1000);
      const totalLatencySeconds = accumulatedTimeRef.current + currentLegSeconds;
      const isCorrect = device === cmd.targetDevice;

      if (isCorrect) {
        // Lock selections immediately during transition
        setIsCommandTransitioning(true);
        isCommandTransitioningRef.current = true;

        // Apply requested command state to appliance
        setDevices((prev) => ({
          ...prev,
          [cmd.targetDevice]: cmd.requestedState,
        }));

        // Log successful trial
        const newRecord: TrialRecord = {
          id: crypto.randomUUID(),
          trialNumber: trials.length + 1,
          participant: participantId,
          conditionDwellTime: dwellTime,
          commandTarget: cmd.targetDevice,
          requestedState: cmd.requestedState,
          selectedDevice: device,
          correct: true,
          timeSeconds: Math.max(0.01, totalLatencySeconds),
          timestamp: new Date().toISOString(),
        };

        setTrials((prev) => [...prev, newRecord]);
        soundFx.playCommandCorrect();
        setTrialFeedback({
          type: 'success',
          message: `Correct! ${cmd.displayText} completed in ${totalLatencySeconds.toFixed(2)}s`,
        });

        // Clear any lingering transition timer
        if (transitionTimeoutRef.current !== null) {
          clearTimeout(transitionTimeoutRef.current);
        }

        // Delay before presenting next command (allows visual confirmation)
        transitionTimeoutRef.current = window.setTimeout(() => {
          transitionTimeoutRef.current = null;
          // Guard: ensure experiment is still running and not paused before generating next command
          if (isExperimentRunningRef.current && !isExperimentPausedRef.current) {
            const next = generateNextCommand();
            setCurrentCommand(next);
            accumulatedTimeRef.current = 0;
            commandStartTimeRef.current = performance.now();
            setIsCommandTransitioning(false);
            isCommandTransitioningRef.current = false;
            setTrialFeedback({ type: null, message: null });
          }
        }, 750);
      } else {
        // Wrong target selected: log error, do not set device state to target
        const newRecord: TrialRecord = {
          id: crypto.randomUUID(),
          trialNumber: trials.length + 1,
          participant: participantId,
          conditionDwellTime: dwellTime,
          commandTarget: cmd.targetDevice,
          requestedState: cmd.requestedState,
          selectedDevice: device,
          correct: false,
          timeSeconds: Math.max(0.01, totalLatencySeconds),
          timestamp: new Date().toISOString(),
        };

        setTrials((prev) => [...prev, newRecord]);
        soundFx.playCommandError();
        setTrialFeedback({
          type: 'error',
          message: `Incorrect: Selected ${device} instead of requested ${cmd.targetDevice}. Try again.`,
        });
      }
    },
    [mode, trials.length, participantId, dwellTime, generateNextCommand]
  );

  // 5. Dwell Selection State Machine Hook
  const isGazeActive = trackingStatus === 'tracking' || isDemoSimulation;
  const {
    activeHoverTarget,
    dwellProgress,
    isLocked,
    lockedDevice,
    registerTargetElement,
    resetDwell,
    triggerManualClick,
  } = useDwellSelection({
    gazeCoords,
    dwellTimeSeconds: dwellTime,
    isActive: isGazeActive,
    onSelect: handleSelectDevice,
  });

  // 6. Experiment Control Handlers
  const handleStartExperimentBlock = () => {
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setIsCommandTransitioning(false);
    isCommandTransitioningRef.current = false;

    setIsExperimentRunning(true);
    isExperimentRunningRef.current = true;
    setIsExperimentPaused(false);
    isExperimentPausedRef.current = false;

    const firstCmd = generateNextCommand();
    setCurrentCommand(firstCmd);
    accumulatedTimeRef.current = 0;
    commandStartTimeRef.current = performance.now();
    setTrialFeedback({ type: null, message: null });
    resetDwell();
  };

  const handlePauseExperimentBlock = () => {
    // If waiting for next command, clear pending timeout
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setIsCommandTransitioning(false);
    isCommandTransitioningRef.current = false;

    // Freeze accumulated time accurately
    if (commandStartTimeRef.current > 0) {
      const leg = Math.max(0, (performance.now() - commandStartTimeRef.current) / 1000);
      accumulatedTimeRef.current += leg;
    }

    setIsExperimentPaused(true);
    isExperimentPausedRef.current = true;
    resetDwell();
  };

  const handleResumeExperimentBlock = () => {
    setIsExperimentPaused(false);
    isExperimentPausedRef.current = false;
    commandStartTimeRef.current = performance.now();
    resetDwell();
  };

  const handleEndExperimentBlock = () => {
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setIsCommandTransitioning(false);
    isCommandTransitioningRef.current = false;
    setIsExperimentRunning(false);
    isExperimentRunningRef.current = false;
    setIsExperimentPaused(false);
    isExperimentPausedRef.current = false;
    setCurrentCommand(null);
    accumulatedTimeRef.current = 0;
    resetDwell();
  };

  const handleClearTrials = () => {
    if (window.confirm('Are you sure you want to reset all recorded trial records for this session?')) {
      setTrials([]);
      setTrialFeedback({ type: null, message: null });
    }
  };

  // Reset all appliances to OFF
  const handleResetAppliances = () => {
    setDevices(INITIAL_DEVICES);
    resetDwell();
  };

  // Calibration handlers
  const handleOpenCalibration = () => {
    setIsCalibrationOpen(true);
    startCalibration();
    setCameraPreviewVisible(true);
  };

  const handleFinishCalibration = () => {
    setIsCalibrationOpen(false);
    finishCalibration();
  };

  const handleCancelCalibration = () => {
    setIsCalibrationOpen(false);
    cancelCalibration();
  };

  const handleSaveSurvey = (data: SurveyData) => {
    setSurveys((prev) => [...prev, data]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header Navigation */}
      <Header
        mode={mode}
        trackingStatus={trackingStatus}
        onStartTracking={async () => {
          const started = await startTracking();
          if (started) {
            setIsCalibrationOpen(true);
            setCameraPreviewVisible(true);
          }
        }}
        onStopTracking={stopTracking}
        showGazeDot={showGazeDot}
        onToggleGazeDot={() => setShowGazeDot(!showGazeDot)}
        isDemoSimulation={isDemoSimulation}
        onToggleDemoSimulation={() => {
          setIsDemoSimulation(!isDemoSimulation);
          resetDwell();
        }}
        onRecalibrate={handleOpenCalibration}
      />

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-4">
        {/* Compact Prototype Framing Notice */}
        <div className="bg-white rounded-lg border border-slate-200 px-3.5 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-600 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="font-semibold text-slate-800">
              Simulated BCI Interface (Webcam Gaze Prototype)
            </span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span className="hidden md:inline text-slate-500">
              Simulates brain-computer interface target selection via webcam eye gaze tracking and dwell-time activation.
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">
            No EEG / neural hardware required
          </span>
        </div>

        {/* PROMINENT ABOVE-THE-FOLD COMMAND BANNER */}
        <ActiveCommandBanner
          mode={mode}
          onModeChange={(newMode) => {
            if (newMode === 'manual' && isExperimentRunning) {
              handleEndExperimentBlock();
            }
            setMode(newMode);
            resetDwell();
            setTrialFeedback({ type: null, message: null });
          }}
          currentCommand={currentCommand}
          isRunning={isExperimentRunning}
          isPaused={isExperimentPaused}
          isTransitioning={isCommandTransitioning}
          elapsedTime={elapsedTime}
          dwellTime={dwellTime}
          feedback={trialFeedback}
          onStartBlock={handleStartExperimentBlock}
          onPauseBlock={handlePauseExperimentBlock}
          onResumeBlock={handleResumeExperimentBlock}
          onEndBlock={handleEndExperimentBlock}
        />

        {/* 2-Column Responsive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: 2x2 Appliance Target Grid (8 cols on desktop) */}
          <section className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Target Appliance Selection Grid
                </h2>
                <p className="text-[11px] text-slate-500">
                  {mode === 'manual'
                    ? 'Fixate gaze or click on any target to toggle state. Dwell threshold triggers selection.'
                    : isExperimentPaused
                    ? 'Session paused · Selection locked'
                    : isCommandTransitioning
                    ? 'Command accepted · Switching to next target'
                    : currentCommand
                    ? `Current Target: ${currentCommand.targetDevice} → ${currentCommand.requestedState}`
                    : 'Click "Start Experiment Block" above to begin trials'}
                </p>
              </div>

              {/* Status Indicator */}
              <div className="text-[11px] text-slate-500 font-mono">
                {isGazeActive ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Dwell Active ({dwellTime.toFixed(1)}s)</span>
                  </span>
                ) : (
                  <span className="text-slate-400">Mouse Click Mode</span>
                )}
              </div>
            </div>

            {/* 2x2 Grid Component */}
            <ApplianceGrid
              devices={devices}
              activeHoverTarget={activeHoverTarget}
              dwellProgress={dwellProgress}
              lockedDevice={lockedDevice}
              onRegisterTarget={registerTargetElement}
              onSelectDevice={(device) => {
                triggerManualClick(device);
              }}
              compact={mode === 'experiment'}
              targetHintDevice={
                mode === 'experiment' &&
                currentCommand &&
                !isExperimentPaused &&
                !isCommandTransitioning
                  ? currentCommand.targetDevice
                  : null
              }
            />
          </section>

          {/* Right Column: Settings & Session/Data Area (4 cols on desktop) */}
          <aside className="lg:col-span-4 space-y-4">
            {/* Control Panel (Dwell Time & Settings) */}
            <ControlPanel
              mode={mode}
              onModeChange={(newMode) => {
                if (newMode === 'manual' && isExperimentRunning) {
                  handleEndExperimentBlock();
                }
                setMode(newMode);
                resetDwell();
                setTrialFeedback({ type: null, message: null });
              }}
              dwellTime={dwellTime}
              onDwellTimeChange={(time) => {
                setDwellTime(time);
                resetDwell();
              }}
              trackingStatus={trackingStatus}
              errorMessage={errorMessage}
              onStartTracking={async () => {
                const started = await startTracking();
                if (started) {
                  setIsCalibrationOpen(true);
                  setCameraPreviewVisible(true);
                }
              }}
              onRecalibrate={handleOpenCalibration}
              onResetAppliances={handleResetAppliances}
            />

            {/* In Experiment Mode: Show Session Data & Metrics Dashboard */}
            {mode === 'experiment' && (
              <ExperimentPanel
                isRunning={isExperimentRunning}
                isPaused={isExperimentPaused}
                trials={trials}
                dwellTime={dwellTime}
                participantId={participantId}
                onParticipantIdChange={setParticipantId}
                onClearTrials={handleClearTrials}
                onOpenSurvey={() => setIsSurveyOpen(true)}
              />
            )}
          </aside>
        </div>
      </main>

      {/* Floating Real-Time Gaze Reticle HUD */}
      <GazeReticle
        coords={gazeCoords}
        visible={showGazeDot && isGazeActive}
        isLocked={isLocked}
        dwellProgress={dwellProgress}
      />

      {/* 9-Point Eye-Tracking Calibration Screen */}
      <CalibrationOverlay
        isOpen={isCalibrationOpen}
        gazeCoords={gazeCoords}
        faceStatus={faceStatus}
        onBeginPointCalibration={startCalibration}
        onBeginLocalCalibration={startLocalCalibration}
        onStartValidation={startValidation}
        onValidationComplete={() => undefined}
        onCameraPreviewVisible={setCameraPreviewVisible}
        onFinish={handleFinishCalibration}
        onCancel={handleCancelCalibration}
        onRecordPoint={recordCalibrationPoint}
      />

      {/* Post-Experiment Questionnaire Modal */}
      <SurveyModal
        isOpen={isSurveyOpen}
        onClose={() => setIsSurveyOpen(false)}
        participantId={participantId}
        onSaveSurvey={handleSaveSurvey}
        existingSurveys={surveys}
      />
    </div>
  );
}
