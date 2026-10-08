/**
 * Component: ActiveCommandBanner
 * Prominently displays the active experimental command, trial status, live stopwatch,
 * and primary execution controls (Start / Pause / Resume / End) directly above the appliance grid.
 */

import React from 'react';
import {
  Play,
  Pause,
  Square,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  Sliders,
  PauseCircle,
  Sparkles,
  Lock,
} from 'lucide-react';
import { AppMode, DwellTimeOption, ExperimentCommand } from '../types';

interface ActiveCommandBannerProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  currentCommand: ExperimentCommand | null;
  isRunning: boolean;
  isPaused: boolean;
  isTransitioning: boolean;
  elapsedTime: number;
  dwellTime: DwellTimeOption;
  feedback: {
    type: 'success' | 'error' | null;
    message: string | null;
  };
  onStartBlock: () => void;
  onPauseBlock: () => void;
  onResumeBlock: () => void;
  onEndBlock: () => void;
}

export const ActiveCommandBanner: React.FC<ActiveCommandBannerProps> = ({
  mode,
  onModeChange,
  currentCommand,
  isRunning,
  isPaused,
  isTransitioning,
  elapsedTime,
  dwellTime,
  feedback,
  onStartBlock,
  onPauseBlock,
  onResumeBlock,
  onEndBlock,
}) => {
  // If in Manual Mode: show a clean, non-obtrusive status bar without fake commands
  if (mode === 'manual') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Manual Interactive Mode
              </span>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                Dwell: {dwellTime.toFixed(1)}s
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Freely fixate gaze or click any appliance to toggle ON/OFF.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onModeChange('experiment')}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all whitespace-nowrap self-start sm:self-auto"
        >
          <Play className="w-3.5 h-3.5 text-emerald-400" />
          <span>Switch to Experiment Mode</span>
        </button>
      </div>
    );
  }

  // EXPERIMENT MODE
  return (
    <div className="rounded-xl border-2 border-slate-800 bg-slate-900 text-white shadow-md p-4 sm:p-5 transition-all relative overflow-hidden">
      {/* Top Metadata Row: Status, Dwell, Live Stopwatch */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-blue-400" />
            <span>Target Command</span>
          </span>

          {/* Status Badge */}
          {isPaused ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <PauseCircle className="w-3 h-3 text-amber-400" />
              <span>PAUSED</span>
            </span>
          ) : isTransitioning ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">
              <Lock className="w-3 h-3 text-blue-400" />
              <span>SWITCHING COMMAND</span>
            </span>
          ) : isRunning ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>ACTIVE TRIAL</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
              <span>READY</span>
            </span>
          )}
        </div>

        {/* Condition & Elapsed Time Indicators */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Dwell: {dwellTime.toFixed(1)}s</span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs font-mono bg-slate-950/80 px-3 py-1 rounded-md border border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase">Latency:</span>
            <span
              className={`font-bold ${
                isPaused
                  ? 'text-amber-300'
                  : isTransitioning
                  ? 'text-blue-300'
                  : 'text-emerald-400'
              }`}
            >
              {elapsedTime.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>

      {/* Main Command & Action Section */}
      <div className="pt-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Command Display */}
        <div className="min-w-0 space-y-1">
          {isPaused ? (
            <div>
              <div className="text-xl sm:text-2xl font-bold text-amber-300 flex items-center gap-2">
                <PauseCircle className="w-6 h-6 text-amber-400 shrink-0" />
                <span>Experiment Session Paused</span>
              </div>
              <p className="text-xs text-amber-200/80 mt-1">
                Target selection is temporarily disabled. Click &quot;Resume Block&quot; to continue current trial.
              </p>
            </div>
          ) : isTransitioning ? (
            <div>
              <div className="text-xl sm:text-2xl font-bold text-blue-300 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <span>Command Accepted! Loading Next...</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Selection locked to prevent duplicate triggers. Please reset gaze.
              </p>
            </div>
          ) : isRunning && currentCommand ? (
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>{currentCommand.displayText}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Look at target <strong className="text-white font-mono">{currentCommand.targetDevice}</strong> and hold gaze until dwell triggers state to <strong className="text-white font-mono">{currentCommand.requestedState}</strong>.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-200">
                Ready to Start Trial Block
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Click &quot;Start Experiment Block&quot; to begin randomized appliance commands with response latency logging.
              </p>
            </div>
          )}
        </div>

        {/* Primary Controls (Right beside the command for instant access) */}
        <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
          {!isRunning ? (
            <button
              type="button"
              onClick={onStartBlock}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-blue-400 focus:outline-none"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Experiment Block</span>
            </button>
          ) : isPaused ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResumeBlock}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 active:scale-95 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-amber-300 focus:outline-none"
              >
                <Play className="w-4 h-4 fill-slate-900" />
                <span>Resume Block</span>
              </button>
              <button
                type="button"
                onClick={onEndBlock}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
              >
                <Square className="w-3.5 h-3.5" />
                <span>End</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPauseBlock}
                disabled={isTransitioning}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/40 rounded-lg transition-colors disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
              <button
                type="button"
                onClick={onEndBlock}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>End</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Immediate Transient Feedback Bar (Success / Error) */}
      {feedback.message && (
        <div
          className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 border transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
