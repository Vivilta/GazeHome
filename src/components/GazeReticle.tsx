/**
 * Component: GazeReticle
 * Shows a soft gaze area and a short, low-contrast trail instead of a sharp cursor.
 */

import React, { useEffect, useState } from 'react';
import { GazeCoordinates } from '../types';

interface GazeReticleProps {
  coords: GazeCoordinates;
  visible: boolean;
  isLocked: boolean;
  dwellProgress: number;
}

interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

export const GazeReticle: React.FC<GazeReticleProps> = ({
  coords,
  visible,
  isLocked,
  dwellProgress,
}) => {
  const [trail, setTrail] = useState<TrailPoint[]>([]);

  useEffect(() => {
    if (!coords.isValid) {
      setTrail([]);
      return;
    }

    setTrail((current) => [
      ...current,
      { x: coords.x, y: coords.y, timestamp: coords.timestamp },
    ].slice(-6));
  }, [coords.x, coords.y, coords.timestamp, coords.isValid]);

  if (!visible || !coords.isValid) return null;

  const size = 52;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - dwellProgress * circumference;
  const trailPoints = trail.slice(0, -1);

  return (
    <>
      {trailPoints.map((point, index) => (
        <div
          key={`${point.timestamp}-${index}`}
          aria-hidden="true"
          className="fixed pointer-events-none z-40 h-2.5 w-2.5 rounded-full bg-sky-300/20 blur-[1px] transition-opacity duration-200"
          style={{
            left: `${point.x}px`,
            top: `${point.y}px`,
            opacity: 0.08 + (index / Math.max(1, trailPoints.length)) * 0.12,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      <div
        className="fixed pointer-events-none z-50"
        style={{
          left: `${coords.x}px`,
          top: `${coords.y}px`,
          transform: 'translate(-50%, -50%)',
        }}
        aria-label="Estimated gaze area"
      >
        <div className="relative flex h-[52px] w-[52px] items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full border ${
              isLocked
                ? 'border-emerald-300/60 bg-emerald-400/10'
                : dwellProgress > 0
                ? 'border-sky-300/60 bg-sky-400/10'
                : 'border-white/35 bg-white/5'
            } animate-pulse`}
          />
          <svg width={size} height={size} className="absolute rotate-[-90deg] drop-shadow-sm">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="2"
            />
            {dwellProgress > 0 && !isLocked && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#7dd3fc"
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            )}
            {isLocked && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#6ee7b7"
                strokeWidth="3"
              />
            )}
          </svg>
          <div className={`h-2 w-2 rounded-full ${isLocked ? 'bg-emerald-300/80' : 'bg-white/65'}`} />
        </div>
      </div>
    </>
  );
};
