/**
 * Structured, privacy-preserving diagnostics for webcam gaze tracking.
 * Numeric gaze coordinates and state transitions are recorded; video and
 * face images are never stored.
 */

import { CALIBRATION_CONFIG } from '../config/calibration';
import { createId } from './createId';

export interface GazeDiagnosticEvent {
  timestamp: string;
  performanceMs: number;
  sessionId: string | null;
  type: string;
  details: Record<string, unknown>;
}

interface GazeDiagnosticsApi {
  getEvents: () => GazeDiagnosticEvent[];
  clear: () => void;
  exportJson: () => string;
  download: () => void;
}

let sessionId: string | null = null;
let events: GazeDiagnosticEvent[] = [];

function round(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

function createSessionId() {
  return createId();
}

export function startGazeDiagnosticsSession(details: Record<string, unknown> = {}) {
  sessionId = createSessionId();
  events = [];
  logGazeDiagnostic('diagnostics_session_started', details);
  return sessionId;
}

export function logGazeDiagnostic(type: string, details: Record<string, unknown> = {}) {
  if (!CALIBRATION_CONFIG.diagnostics.enabled) return;

  const event: GazeDiagnosticEvent = {
    timestamp: new Date().toISOString(),
    performanceMs: round(typeof performance !== 'undefined' ? performance.now() : 0),
    sessionId,
    type,
    details,
  };

  events = [...events, event].slice(-CALIBRATION_CONFIG.diagnostics.maxEvents);
  console.info(`[GazeDiagnostics] ${event.timestamp} ${type}`, event.details);
}

export function getGazeDiagnosticEvents() {
  return [...events];
}

export function clearGazeDiagnosticEvents() {
  events = [];
}

export function exportGazeDiagnostics() {
  return JSON.stringify({ sessionId, events }, null, 2);
}

function downloadGazeDiagnostics() {
  if (typeof document === 'undefined') return;
  const blob = new Blob([exportGazeDiagnostics()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gazehome-gaze-diagnostics-${new Date().toISOString().replaceAll(':', '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export const gazeDiagnostics: GazeDiagnosticsApi = {
  getEvents: getGazeDiagnosticEvents,
  clear: clearGazeDiagnosticEvents,
  exportJson: exportGazeDiagnostics,
  download: downloadGazeDiagnostics,
};

if (typeof window !== 'undefined') {
  window.gazeHomeDiagnostics = gazeDiagnostics;
}

declare global {
  interface Window {
    gazeHomeDiagnostics?: GazeDiagnosticsApi;
  }
}
