/**
 * Component: ApplianceGrid
 * 2x2 responsive grid containing LIGHT, FAN, TV, AC targets
 */

import React from 'react';
import { ApplianceCard } from './ApplianceCard';
import { DeviceType, DevicesMap } from '../types';

interface ApplianceGridProps {
  devices: DevicesMap;
  activeHoverTarget: DeviceType | null;
  dwellProgress: number;
  lockedDevice: DeviceType | null;
  onRegisterTarget: (device: DeviceType, el: HTMLElement | null) => void;
  onSelectDevice: (device: DeviceType) => void;
  targetHintDevice?: DeviceType | null;
  compact?: boolean;
}

const ORDERED_DEVICES: DeviceType[] = ['LIGHT', 'FAN', 'TV', 'AC'];

export const ApplianceGrid: React.FC<ApplianceGridProps> = ({
  devices,
  activeHoverTarget,
  dwellProgress,
  lockedDevice,
  onRegisterTarget,
  onSelectDevice,
  targetHintDevice = null,
  compact = false,
}) => {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
        {ORDERED_DEVICES.map((device) => {
          const isFocused = activeHoverTarget === device;
          const isLocked = lockedDevice === device;
          const currentProgress = isFocused ? dwellProgress : 0;

          return (
            <ApplianceCard
              key={device}
              device={device}
              state={devices[device]}
              isFocused={isFocused}
              dwellProgress={currentProgress}
              isLocked={isLocked}
              onRegister={onRegisterTarget}
              onClick={onSelectDevice}
              isTargetHint={targetHintDevice === device}
              compact={compact}
            />
          );
        })}
      </div>
    </div>
  );
};
