/**
 * Hook: useDwellSelection
 * State machine for dwell-based gaze selection with anti-repeat locking.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceType, DwellTimeOption, GazeCoordinates } from '../types';
import { soundFx } from '../utils/audio';

interface UseDwellSelectionOptions {
  gazeCoords: GazeCoordinates;
  dwellTimeSeconds: DwellTimeOption;
  isActive: boolean;
  onSelect: (device: DeviceType) => void;
}

interface UseDwellSelectionReturn {
  activeHoverTarget: DeviceType | null;
  dwellProgress: number; // 0.0 to 1.0
  isLocked: boolean;
  lockedDevice: DeviceType | null;
  registerTargetElement: (device: DeviceType, el: HTMLElement | null) => void;
  resetDwell: () => void;
  triggerManualClick: (device: DeviceType) => void;
}

export function useDwellSelection({
  gazeCoords,
  dwellTimeSeconds,
  isActive,
  onSelect,
}: UseDwellSelectionOptions): UseDwellSelectionReturn {
  const [activeHoverTarget, setActiveHoverTarget] = useState<DeviceType | null>(null);
  const [dwellProgress, setDwellProgress] = useState<number>(0);
  const [lockedDevice, setLockedDevice] = useState<DeviceType | null>(null);

  const elementsMapRef = useRef<Map<DeviceType, HTMLElement>>(new Map());
  const dwellStartTimeRef = useRef<number | null>(null);
  const activeTargetRef = useRef<DeviceType | null>(null);
  const lockedDeviceRef = useRef<DeviceType | null>(null);
  const onSelectRef = useRef(onSelect);
  const lastTickQuarterRef = useRef<number>(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const registerTargetElement = useCallback((device: DeviceType, el: HTMLElement | null) => {
    if (el) {
      elementsMapRef.current.set(device, el);
    } else {
      elementsMapRef.current.delete(device);
    }
  }, []);

  const resetDwell = useCallback(() => {
    dwellStartTimeRef.current = null;
    activeTargetRef.current = null;
    lockedDeviceRef.current = null;
    lastTickQuarterRef.current = 0;
    setActiveHoverTarget(null);
    setDwellProgress(0);
    setLockedDevice(null);
  }, []);

  // When condition (dwell time) changes or tracking deactivated, reset state
  useEffect(() => {
    resetDwell();
  }, [dwellTimeSeconds, isActive, resetDwell]);

  // Direct manual click support (mouse / keyboard fallback)
  const triggerManualClick = useCallback((device: DeviceType) => {
    soundFx.playSelectSuccess();
    onSelectRef.current(device);
  }, []);

  // Determine which target the coordinates fall into
  const findTargetUnderGaze = useCallback((x: number, y: number): DeviceType | null => {
    for (const [device, el] of elementsMapRef.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return device;
      }
    }
    return null;
  }, []);

  // Core Animation Frame / State Machine Loop
  useEffect(() => {
    if (!isActive || !gazeCoords.isValid) {
      if (activeTargetRef.current !== null || dwellProgress !== 0) {
        resetDwell();
      }
      return;
    }

    const currentTarget = findTargetUnderGaze(gazeCoords.x, gazeCoords.y);
    const now = performance.now();
    const dwellDurationMs = dwellTimeSeconds * 1000;

    // 1. Gaze is currently not on any target
    if (!currentTarget) {
      if (activeTargetRef.current !== null || lockedDeviceRef.current !== null) {
        // Gaze left all targets: release locks and clear dwell
        dwellStartTimeRef.current = null;
        activeTargetRef.current = null;
        lockedDeviceRef.current = null;
        lastTickQuarterRef.current = 0;
        setActiveHoverTarget(null);
        setDwellProgress(0);
        setLockedDevice(null);
      }
      return;
    }

    // 2. Gaze moved to a DIFFERENT target than the locked one
    if (lockedDeviceRef.current && lockedDeviceRef.current !== currentTarget) {
      lockedDeviceRef.current = null;
      setLockedDevice(null);
    }

    // 3. Target is currently locked by anti-repeat rule
    if (lockedDeviceRef.current === currentTarget) {
      // User is still looking at the same target that just triggered.
      // Do NOT trigger again. Progress stays at 0 or 1.0 without retriggering.
      return;
    }

    // 4. Target changed to a fresh target
    if (activeTargetRef.current !== currentTarget) {
      activeTargetRef.current = currentTarget;
      dwellStartTimeRef.current = now;
      lastTickQuarterRef.current = 0;
      setActiveHoverTarget(currentTarget);
      setDwellProgress(0);
      return;
    }

    // 5. Gaze continues dwelling on currentTarget
    if (dwellStartTimeRef.current !== null) {
      const elapsed = now - dwellStartTimeRef.current;
      const progress = Math.min(1.0, elapsed / dwellDurationMs);
      setDwellProgress(progress);

      // Play soft audio feedback on 50% milestone
      const currentQuarter = Math.floor(progress * 4);
      if (currentQuarter > lastTickQuarterRef.current && currentQuarter < 4) {
        soundFx.playDwellTick();
        lastTickQuarterRef.current = currentQuarter;
      }

      // 6. Dwell threshold REACHED
      if (elapsed >= dwellDurationMs) {
        // Trigger selection EXACTLY ONCE
        soundFx.playSelectSuccess();
        onSelectRef.current(currentTarget);

        // Engage anti-repeat lock
        lockedDeviceRef.current = currentTarget;
        setLockedDevice(currentTarget);
        dwellStartTimeRef.current = null;
        setDwellProgress(0);
      }
    }
  }, [
    gazeCoords,
    isActive,
    dwellTimeSeconds,
    findTargetUnderGaze,
    resetDwell,
    dwellProgress,
  ]);

  return {
    activeHoverTarget,
    dwellProgress,
    isLocked: lockedDevice !== null,
    lockedDevice,
    registerTargetElement,
    resetDwell,
    triggerManualClick,
  };
}
