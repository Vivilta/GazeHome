/**
 * Component: ControlPanel
 * Dwell time segmented controls, mode switcher, and session controls
 */

import React from 'react';
import { Clock, Sliders, RotateCcw, Power, AlertCircle } from 'lucide-react';
import { AppMode, DwellTimeOption, TrackingStatus } from '../types';

interface ControlPanelProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  dwellTime: DwellTimeOption;
  onDwellTimeChange: (time: DwellTimeOption) => void;
  trackingStatus: TrackingStatus;
  errorMessage: string | null;
  onStartTracking: () => void;
  onRecalibrate: () => void;
  onResetAppliances: () => void;
}

const DWELL_OPTIONS: DwellTimeOption[] = [0.5, 1.0, 1.5];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  mode,
  onModeChange,
  dwellTime,
  onDwellTimeChange,
  trackingStatus,
  errorMessage,
  onStartTracking,
  onRecalibrate,
  onResetAppliances,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-6">
      {/* Section 1: Mode Switcher */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>Operating Mode</span>
          </label>
        </div>

        {/* Clean Segmented Control */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => onModeChange('manual')}
            className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
              mode === 'manual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Manual Mode
          </button>
          <button
            type="button"
            onClick={() => onModeChange('experiment')}
            className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
              mode === 'experiment'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Experiment Mode
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          {mode === 'manual'
            ? 'Free interactive toggle: gaze or click any appliance to switch ON/OFF.'
            : 'Structured trials: follow random target commands with automated latency logging.'}
        </p>
      </div>

      {/* Section 2: Dwell Time Selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Dwell Time Threshold</span>
          </label>
          <span className="text-xs font-mono text-slate-500">
            {dwellTime.toFixed(1)}s trigger
          </span>
        </div>

        {/* Segmented Control for 0.5s, 1.0s, 1.5s */}
        <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-xl gap-1">
          {DWELL_OPTIONS.map((time) => {
            const isSelected = dwellTime === time;
            return (
              <button
                key={time}
                type="button"
                onClick={() => onDwellTimeChange(time)}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {time.toFixed(1)} s
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Hold gaze inside appliance card until dwell reaches threshold to activate.
        </p>
      </div>

      {/* Section 3: Calibration & Quick Actions */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
          Actions & Calibration
        </label>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRecalibrate}
            disabled={trackingStatus === 'not_started' || trackingStatus === 'checking_camera' || trackingStatus === 'calibrating' || trackingStatus === 'validating'}
            className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none rounded-lg border border-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Recalibrate</span>
          </button>

          <button
            type="button"
            onClick={onResetAppliances}
            className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            <Power className="w-3.5 h-3.5 text-slate-500" />
            <span>Turn All OFF</span>
          </button>
        </div>
      </div>

      {(trackingStatus === 'checking_camera' || trackingStatus === 'calibrating' || trackingStatus === 'validating') && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          <span className="font-semibold block">
            {trackingStatus === 'checking_camera'
              ? 'Checking camera connection'
              : trackingStatus === 'calibrating'
              ? 'Calibration in progress'
              : 'Calibration accuracy check in progress'}
          </span>
          <p className="mt-1 text-sky-800">
            {trackingStatus === 'checking_camera'
              ? 'Loading the gaze tracker and requesting camera access. This may take a few seconds.'
              : trackingStatus === 'calibrating'
              ? 'Follow the highlighted target and keep your head roughly still for a moment.'
              : 'Look at each validation target without clicking. The measured result will determine whether calibration passes.'}
          </p>
        </div>
      )}

      {/* Error or Not Started Recovery Notice */}
      {(trackingStatus === 'error' || trackingStatus === 'not_started') && (
        <div className="rounded-xl p-3.5 bg-slate-50 border border-slate-200 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-slate-700">
              <span className="font-semibold block text-slate-900">
                {trackingStatus === 'error' ? 'Gaze Tracking Unavailable' : 'Camera Tracking Standby'}
              </span>
              <p className="mt-0.5 text-slate-600">
                {errorMessage ||
                  'Click "Start Tracking" to enable webcam gaze tracking. You can always use direct mouse clicks or enable Demo Sim.'}
              </p>
            </div>
          </div>
          {trackingStatus === 'error' && (
            <button
              type="button"
              onClick={onStartTracking}
              className="w-full mt-1 py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold border border-slate-300 rounded-lg transition-colors text-xs"
            >
              Retry Camera Permission
            </button>
          )}
        </div>
      )}
    </div>
  );
};
