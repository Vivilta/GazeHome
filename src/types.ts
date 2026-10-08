/**
 * GazeHome - Core Type Definitions
 * Simulated BCI Interface / Gaze-Based Control Prototype
 */

export type DeviceType = 'LIGHT' | 'FAN' | 'TV' | 'AC';

export type DeviceState = 'ON' | 'OFF';

export type DevicesMap = Record<DeviceType, DeviceState>;

export type TrackingStatus =
  | 'not_started'
  | 'checking_camera'
  | 'calibrating'
  | 'validating'
  | 'tracking'
  | 'paused'
  | 'error';

export type FaceTrackingStatus = 'not_detected' | 'detected' | 'moving' | 'stable';

export type AppMode = 'manual' | 'experiment';

export type DwellTimeOption = 0.5 | 1.0 | 1.5;

export interface GazeCoordinates {
  x: number;
  y: number;
  timestamp: number;
  isValid: boolean;
}

export interface ExperimentCommand {
  id: string;
  targetDevice: DeviceType;
  requestedState: DeviceState;
  displayText: string;
}

export interface TrialRecord {
  id: string;
  trialNumber: number;
  participant: string;
  conditionDwellTime: number; // in seconds, e.g. 0.5, 1.0, 1.5
  commandTarget: DeviceType;
  requestedState: DeviceState;
  selectedDevice: DeviceType;
  correct: boolean;
  timeSeconds: number;
  timestamp: string; // ISO string
}

export interface SurveyData {
  participant: string;
  q1_easy_to_use: number; // 1 - 5
  q2_responsive: number; // 1 - 5
  q3_in_control: number; // 1 - 5
  q4_dwell_comfortable: number; // 1 - 5
  q5_smart_home_acceptance: number; // 1 - 5
  preferredDwellTime: DwellTimeOption;
  comments: string;
  submittedAt: string;
}

export interface CalibrationPoint {
  id: number;
  xPercent: number; // 0 - 100
  yPercent: number; // 0 - 100
  clicksRemaining: number;
  completed: boolean;
}

export interface CalibrationResult {
  validSampleCount: number;
  rawSampleCount: number;
  discardedSampleCount: number;
  meanErrorPx: number;
  medianErrorPx: number;
  withinTolerancePercent: number;
  regionErrors: CalibrationRegionError[];
  passed: boolean;
}

export interface CalibrationRegionError {
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
  calibrationPointIndex: number;
  sampleCount: number;
  medianErrorPx: number;
  meanErrorPx: number;
  withinTolerancePercent: number;
}
