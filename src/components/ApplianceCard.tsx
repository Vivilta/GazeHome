/**
 * Component: ApplianceCard
 * Large interactive appliance target with dwell progress, clear ON/OFF text, and anti-repeat lock
 */

import React, { useEffect, useRef } from 'react';
import { Lightbulb, Fan, Tv, Snowflake, CheckCircle2, Lock } from 'lucide-react';
import { DeviceType, DeviceState } from '../types';

interface ApplianceCardProps {
  device: DeviceType;
  state: DeviceState;
  isFocused: boolean;
  dwellProgress: number; // 0.0 to 1.0
  isLocked: boolean;
  onRegister: (device: DeviceType, el: HTMLElement | null) => void;
  onClick: (device: DeviceType) => void;
  isTargetHint?: boolean;
  compact?: boolean;
}

export const ApplianceCard: React.FC<ApplianceCardProps> = ({
  device,
  state,
  isFocused,
  dwellProgress,
  isLocked,
  onRegister,
  onClick,
  isTargetHint = false,
  compact = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const isOn = state === 'ON';

  useEffect(() => {
    onRegister(device, cardRef.current);
    return () => {
      onRegister(device, null);
    };
  }, [device, onRegister]);

  // Icon and theme setup based on device
  const getDeviceMeta = () => {
    switch (device) {
      case 'LIGHT':
        return {
          label: 'LIGHT',
          description: 'Living Room Ceiling Lamp',
          icon: Lightbulb,
          activeBg: 'bg-amber-500/10 border-amber-500/40 text-amber-900',
          iconColor: isOn ? 'text-amber-500 fill-amber-400/20' : 'text-slate-400',
          badgeColor: isOn ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600',
        };
      case 'FAN':
        return {
          label: 'FAN',
          description: 'High-Velocity Air Circulator',
          icon: Fan,
          activeBg: 'bg-teal-500/10 border-teal-500/40 text-teal-900',
          iconColor: isOn ? 'text-teal-600' : 'text-slate-400',
          badgeColor: isOn ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600',
        };
      case 'TV':
        return {
          label: 'TV',
          description: 'Smart Display / Media Center',
          icon: Tv,
          activeBg: 'bg-indigo-500/10 border-indigo-500/40 text-indigo-900',
          iconColor: isOn ? 'text-indigo-600' : 'text-slate-400',
          badgeColor: isOn ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600',
        };
      case 'AC':
        return {
          label: 'AC',
          description: 'Climate Control / Thermostat',
          icon: Snowflake,
          activeBg: 'bg-sky-500/10 border-sky-500/40 text-sky-900',
          iconColor: isOn ? 'text-sky-600' : 'text-slate-400',
          badgeColor: isOn ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600',
        };
    }
  };

  const meta = getDeviceMeta();
  const IconComponent = meta.icon;

  return (
    <div
      ref={cardRef}
      data-device-target={device}
      onClick={() => onClick(device)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(device);
        }
      }}
      className={`relative group select-none cursor-pointer rounded-2xl ${compact ? 'p-2 sm:p-2.5 min-h-[210px] sm:min-h-[222px] lg:min-h-[228px]' : 'p-4 sm:p-5 min-h-[210px] sm:min-h-[222px] lg:min-h-[228px]'} flex flex-col justify-between transition-all duration-200 border-2 overflow-hidden ${
        isFocused
          ? 'border-blue-500 ring-4 ring-blue-500/20 shadow-lg scale-[1.01]'
          : isOn
          ? `${meta.activeBg} shadow-sm`
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
      } ${isTargetHint ? 'ring-2 ring-indigo-400/60' : ''}`}
    >
      {/* Top Header Row: Device Name & ON/OFF Badges */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
              {meta.label}
            </h3>
            {isLocked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded-sm">
                <Lock className="w-3 h-3" />
                <span>LOCKED</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
            {meta.description}
          </p>
        </div>

        {/* Explicit Text Status Badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-md text-[11px] font-bold tracking-wide uppercase border transition-colors shrink-0 ${
            isOn
              ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOn ? 'bg-white animate-pulse' : 'bg-slate-400'
            }`}
          />
          <span>STATE: {state}</span>
        </div>
      </div>

      {/* Center Device Visualization */}
      <div className={`${compact ? 'my-0.5' : 'my-2 sm:my-3'} flex items-center justify-center`}>
        <div
            className={`relative ${compact ? 'p-1.5 rounded-lg' : 'p-3.5 sm:p-4 rounded-xl'} transition-all duration-300 ${
            isOn
              ? 'bg-white shadow-md'
              : 'bg-slate-50 border border-slate-100'
          }`}
        >
          <IconComponent
            className={`${compact ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-10 h-10 sm:w-11 sm:h-11'} transition-all duration-300 ${
              meta.iconColor
            } ${device === 'FAN' && isOn ? 'animate-spin [animation-duration:2.5s]' : ''}`}
          />
          {isOn && (
            <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Dwell Progress Bar */}
      <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono text-slate-500 truncate mr-2">
            {isLocked
              ? 'Look away to reset'
              : isFocused
              ? `Dwell: ${Math.round(dwellProgress * 100)}%`
              : 'Gaze or click to toggle'}
          </span>
          <span className="font-mono text-slate-400 text-[10px] shrink-0">
            {isFocused && !isLocked && dwellProgress > 0 && (
              <span className="text-blue-600 font-semibold animate-pulse">
                HOLD GAZE...
              </span>
            )}
          </span>
        </div>

        {/* Visual Progress Bar Track */}
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden p-0.5 border border-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-75 ${
              isLocked
                ? 'bg-emerald-500 w-full'
                : dwellProgress > 0
                ? 'bg-blue-600'
                : 'bg-transparent'
            }`}
            style={{
              width: isLocked ? '100%' : `${Math.min(100, dwellProgress * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Locked overlay banner when anti-repeat is engaged */}
      {isLocked && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none transition-opacity duration-150">
          <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Target Activated · Look Away to Select Again</span>
          </div>
        </div>
      )}
    </div>
  );
};
