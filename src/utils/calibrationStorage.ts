import { CalibrationSessionRecord } from '../types';

const STORAGE_KEY = 'gazehome.calibrationSessions.v1';

export function loadCalibrationSessions(): CalibrationSessionRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as CalibrationSessionRecord[] : [];
  } catch (error) {
    console.warn('Unable to load stored calibration sessions:', error);
    return [];
  }
}

export function saveCalibrationSessions(sessions: CalibrationSessionRecord[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.warn('Unable to save calibration sessions:', error);
  }
}
