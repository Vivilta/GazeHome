import { CalibrationSessionRecord } from '../types';

const STORAGE_KEY = 'gazehome.calibrationSessions.v1';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown) {
  return value === undefined || isFiniteNumber(value);
}

function isNullableFiniteNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
}

function isCalibrationSampleRecord(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const sample = value as Record<string, unknown>;
  return typeof sample.sampleId === 'string'
    && typeof sample.sessionId === 'string'
    && typeof sample.participant === 'string'
    && (sample.phase === 'training' || sample.phase === 'validation')
    && typeof sample.pointId === 'string'
    && isFiniteNumber(sample.pointIndex)
    && typeof sample.region === 'string'
    && isFiniteNumber(sample.targetX)
    && isFiniteNumber(sample.targetY)
    && isNullableFiniteNumber(sample.predictedX)
    && isNullableFiniteNumber(sample.predictedY)
    && isNullableFiniteNumber(sample.errorPx)
    && isOptionalFiniteNumber(sample.eyeFeatureFrameId)
    && isOptionalFiniteNumber(sample.eyeFeaturesAgeMs)
    && isOptionalFiniteNumber(sample.gazeTimestamp)
    && (sample.accepted === undefined || typeof sample.accepted === 'boolean')
    && typeof sample.timestamp === 'string';
}

function isCalibrationSessionRecord(value: unknown): value is CalibrationSessionRecord {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<CalibrationSessionRecord>;
  const result = session.result as Partial<CalibrationSessionRecord['result']> | undefined;
  return typeof session.sessionId === 'string'
    && typeof session.participant === 'string'
    && typeof session.calibratedAt === 'string'
    && isFiniteNumber(session.viewportWidth)
    && isFiniteNumber(session.viewportHeight)
    && (session.mode === 'full' || session.mode === 'local')
    && Array.isArray(session.samples)
    && session.samples.every(isCalibrationSampleRecord)
    && Boolean(result)
    && isFiniteNumber(result?.medianErrorPx)
    && isFiniteNumber(result?.withinTolerancePercent)
    && typeof result?.passed === 'boolean';
}

export function loadCalibrationSessions(): CalibrationSessionRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCalibrationSessionRecord) : [];
  } catch (error) {
    console.warn('Unable to load stored calibration sessions:', error);
    return [];
  }
}

export function saveCalibrationSessions(sessions: CalibrationSessionRecord[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.filter(isCalibrationSessionRecord)));
  } catch (error) {
    console.warn('Unable to save calibration sessions:', error);
  }
}
