/**
 * Component: GazeReticle
 * Displays real-time estimated gaze position and optional coordinate HUD
 */

import React from 'react';
import { GazeCoordinates } from '../types';

interface GazeReticleProps {
  coords: GazeCoordinates;
  visible: boolean;
  isLocked: boolean;
  dwellProgress: number;
}

export const GazeReticle: React.FC<GazeReticleProps> = ({
  coords,
  visible,
  isLocked,
  dwellProgress,
}) => {
  if (!visible || !coords.isValid) return null;

  const size = 36;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - dwellProgress * circumference;

  return (
    <div
      className="fixed pointer-events-none z-50 transition-transform duration-75 ease-out"
      style={{
        left: `${coords.x}px`,
        top: `${coords.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
      aria-label="Estimated gaze position"
    >
      <div className="relative flex items-center justify-center">
        {/* SVG Circular Progress Ring */}
        <svg
          width={size}
          height={size}
          className="rotate-[-90deg] filter drop-shadow-sm"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="rgba(15, 23, 42, 0.15)"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="2"
          />
          {/* Dwell progress stroke */}
          {dwellProgress > 0 && !isLocked && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          )}
          {/* Locked ring state */}
          {isLocked && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#10b981"
              strokeWidth="3.5"
            />
          )}
        </svg>

        {/* Center reticle dot */}
        <div
          className={`absolute w-2 h-2 rounded-full transition-colors ${
            isLocked
              ? 'bg-emerald-500 ring-2 ring-emerald-300'
              : dwellProgress > 0
              ? 'bg-blue-600 scale-125'
              : 'bg-red-500/80 ring-1 ring-white'
          }`}
        />
      </div>

      {/* Coordinate tooltip HUD */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-mono rounded whitespace-nowrap shadow-xs">
        Estimated gaze · {coords.x}, {coords.y}
      </div>
    </div>
  );
};
