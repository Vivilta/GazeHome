/**
 * Component: Header
 * Top navigation bar with tracking status, session mode, and gaze controls
 */

import React from 'react';
import {
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { AppMode, TrackingStatus } from '../types';
import { soundFx } from '../utils/audio';

interface HeaderProps {
  mode: AppMode;
  trackingStatus: TrackingStatus;
  onStartTracking: () => void;
  onStopTracking: () => void;
  showGazeDot: boolean;
  onToggleGazeDot: () => void;
  isDemoSimulation: boolean;
  onToggleDemoSimulation: () => void;
  onRecalibrate: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  trackingStatus,
  onStartTracking,
  onStopTracking,
  showGazeDot,
  onToggleGazeDot,
  isDemoSimulation,
  onToggleDemoSimulation,
  onRecalibrate,
}) => {
  const [soundEnabled, setSoundEnabled] = React.useState<boolean>(soundFx.enabled);

  const toggleSound = () => {
    soundFx.enabled = !soundFx.enabled;
    setSoundEnabled(soundFx.enabled);
  };

  // Format status badge text and color
  const getStatusDisplay = () => {
    switch (trackingStatus) {
      case 'tracking':
        return {
          text: 'Tracking Active',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500 animate-pulse',
        };
      case 'checking_camera':
        return {
          text: 'Checking Camera...',
          color: 'bg-sky-50 text-sky-700 border-sky-200',
          dot: 'bg-sky-500 animate-pulse',
        };
      case 'calibrating':
        return {
          text: 'Calibrating...',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500 animate-ping',
        };
      case 'validating':
        return {
          text: 'Checking Accuracy...',
          color: 'bg-sky-50 text-sky-700 border-sky-200',
          dot: 'bg-sky-500 animate-pulse',
        };
      case 'paused':
        return {
          text: 'Tracking Paused',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
        };
      case 'error':
        return {
          text: 'Tracking Error',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
        };
      case 'not_started':
      default:
        return {
          text: 'Not Started',
          color: 'bg-slate-100 text-slate-600 border-slate-200',
          dot: 'bg-slate-400',
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold tracking-tight text-lg shadow-xs">
            GH
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight leading-none truncate">
                GazeHome
              </h1>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                v1.0
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              Simulated BCI Interface · Gaze-Based Control Prototype
            </p>
          </div>
        </div>

        {/* Status Indicators & Metadata */}
        <div className="hidden md:flex items-center gap-4 text-xs">
          {/* Working Mode Status */}
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="text-slate-400 font-medium">Mode:</span>
            <span className="font-semibold text-slate-800 uppercase tracking-wide">
              {mode}
            </span>
          </div>

          <span className="text-slate-200" aria-hidden="true">|</span>

          {/* Gaze Tracking Status */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Tracker:</span>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${status.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              <span>{status.text}</span>
            </div>
          </div>

          {/* Demo Simulation Warning Pill if active */}
          {isDemoSimulation && (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
              <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />
              <span>Demo Simulation (Mouse)</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'Mute audio feedback' : 'Unmute audio feedback'}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-slate-700" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Gaze Reticle Toggle */}
          <button
            type="button"
            onClick={onToggleGazeDot}
            title={showGazeDot ? 'Hide gaze reticle' : 'Show gaze reticle'}
            className={`p-2 rounded-lg transition-colors border ${
              showGazeDot
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'text-slate-600 hover:bg-slate-100 border-slate-200'
            }`}
            aria-label={showGazeDot ? 'Hide gaze cursor' : 'Show gaze cursor'}
          >
            {showGazeDot ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Recalibrate button (visible when tracking is active) */}
          {trackingStatus === 'tracking' && (
            <button
              type="button"
              onClick={onRecalibrate}
              title="Recalibrate gaze tracking"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Recalibrate</span>
            </button>
          )}

          {/* Demo Simulation Toggle */}
          <button
            type="button"
            onClick={onToggleDemoSimulation}
            title={isDemoSimulation ? 'Disable demo simulation' : 'Simulate gaze with mouse cursor'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              isDemoSimulation
                ? 'bg-purple-100 text-purple-800 border-purple-300 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <span>{isDemoSimulation ? 'Exit Demo' : 'Demo Sim'}</span>
          </button>

          {/* Primary Tracker Start / Stop Button */}
          {trackingStatus === 'not_started' || trackingStatus === 'error' ? (
            <button
              type="button"
              onClick={onStartTracking}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              <span>Start Tracking</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopTracking}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1"
            >
              <Square className="w-3.5 h-3.5 fill-rose-600 text-rose-600" />
              <span>Stop Tracking</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
