/**
 * CSV Generation & Download Utilities
 * Generates standards-compliant CSV files from trial records and survey inputs
 */

import { CalibrationSessionRecord, TrialRecord, SurveyData } from '../types';

/**
 * Escapes fields for CSV format RFC 4180
 */
function escapeCsvValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts array of TrialRecords to CSV string
 */
export function generateTrialsCsv(trials: TrialRecord[]): string {
  const headers = [
    'participant',
    'condition_dwell_time_seconds',
    'command_target',
    'requested_state',
    'selected_device',
    'correct',
    'time_seconds',
    'timestamp',
  ];

  const rows = trials.map((t) => [
    escapeCsvValue(t.participant),
    escapeCsvValue(t.conditionDwellTime),
    escapeCsvValue(t.commandTarget),
    escapeCsvValue(t.requestedState),
    escapeCsvValue(t.selectedDevice),
    escapeCsvValue(t.correct ? 'TRUE' : 'FALSE'),
    escapeCsvValue(t.timeSeconds.toFixed(3)),
    escapeCsvValue(t.timestamp),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

/**
 * Converts survey responses to CSV string
 */
export function generateSurveyCsv(surveys: SurveyData[]): string {
  const headers = [
    'participant',
    'q1_easy_to_use',
    'q2_responsive',
    'q3_in_control',
    'q4_dwell_comfortable',
    'q5_smart_home_acceptance',
    'preferred_dwell_time',
    'comments',
    'submitted_at',
  ];

  const rows = surveys.map((s) => [
    escapeCsvValue(s.participant),
    escapeCsvValue(s.q1_easy_to_use),
    escapeCsvValue(s.q2_responsive),
    escapeCsvValue(s.q3_in_control),
    escapeCsvValue(s.q4_dwell_comfortable),
    escapeCsvValue(s.q5_smart_home_acceptance),
    escapeCsvValue(s.preferredDwellTime),
    escapeCsvValue(s.comments),
    escapeCsvValue(s.submittedAt),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

/**
 * Flattens persistent calibration sessions into one analysis-friendly CSV.
 * Each row preserves the target/prediction pair used to calculate calibration error.
 */
export function generateCalibrationCsv(sessions: CalibrationSessionRecord[]): string {
  const headers = [
    'participant',
    'session_id',
    'calibrated_at',
    'mode',
    'viewport_width',
    'viewport_height',
    'phase',
    'point_id',
    'point_index',
    'region',
    'target_x',
    'target_y',
    'predicted_x',
    'predicted_y',
    'error_px',
    'gaze_stability',
    'eye_feature_frame_id',
    'eye_features_age_ms',
    'gaze_timestamp_ms',
    'accepted_after_filter',
    'median_error_px',
    'within_tolerance_percent',
    'passed',
    'sample_timestamp',
  ];

  const rows = sessions.flatMap((session) => session.samples.map((sample) => [
    escapeCsvValue(session.participant),
    escapeCsvValue(session.sessionId),
    escapeCsvValue(session.calibratedAt),
    escapeCsvValue(session.mode),
    escapeCsvValue(session.viewportWidth),
    escapeCsvValue(session.viewportHeight),
    escapeCsvValue(sample.phase),
    escapeCsvValue(sample.pointId),
    escapeCsvValue(sample.pointIndex),
    escapeCsvValue(sample.region),
    escapeCsvValue(sample.targetX.toFixed(2)),
    escapeCsvValue(sample.targetY.toFixed(2)),
    escapeCsvValue(sample.predictedX === null ? '' : sample.predictedX.toFixed(2)),
    escapeCsvValue(sample.predictedY === null ? '' : sample.predictedY.toFixed(2)),
    escapeCsvValue(sample.errorPx === null ? '' : sample.errorPx.toFixed(2)),
    escapeCsvValue(sample.gazeStability ?? ''),
    escapeCsvValue(sample.eyeFeatureFrameId === undefined ? '' : sample.eyeFeatureFrameId),
    escapeCsvValue(sample.eyeFeaturesAgeMs === undefined ? '' : sample.eyeFeaturesAgeMs.toFixed(2)),
    escapeCsvValue(sample.gazeTimestamp === undefined ? '' : sample.gazeTimestamp.toFixed(2)),
    escapeCsvValue(sample.accepted === undefined ? '' : sample.accepted ? 'TRUE' : 'FALSE'),
    escapeCsvValue(session.result.medianErrorPx.toFixed(2)),
    escapeCsvValue(session.result.withinTolerancePercent.toFixed(2)),
    escapeCsvValue(session.result.passed ? 'TRUE' : 'FALSE'),
    escapeCsvValue(sample.timestamp),
  ]));

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

/**
 * Triggers a file download in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
