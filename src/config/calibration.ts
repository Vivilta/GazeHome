/**
 * User-adjustable calibration parameters.
 *
 * Keep experiment tuning here so comfort and strictness can be changed
 * without searching through the React components.
 */
export const CALIBRATION_CONFIG = {
  // WebGazer training samples collected for each calibration point.
  samplesPerPoint: 15,

  // Continuous stable time required before automatic sampling begins.
  stableWaitMs: 700,

  // Delay between two training samples collected for the same point.
  sampleIntervalMs: 80,

  // Do not label a target from an eye-feature frame older than this age.
  maxEyeFeatureAgeMs: 250,

  // Distance in pixels within which the visual target is considered aligned.
  // This only controls red/blue target feedback, not the training data itself.
  targetAlignmentTolerancePx: 200,

  validation: {
    // Waiting time before validation samples are accepted.
    settleMs: 1000,

    // Validation samples collected for each validation point.
    samplesPerPoint: 10,

    // Maximum time allowed to collect validation samples at one point.
    maxCollectionMs: 3500,

    // Minimum time between validation samples.
    sampleIntervalMs: 80,
  },

  faceStability: {
    // Time range inspected when judging movement of the camera-derived eye centers.
    historyWindowMs: 700,

    // Maximum recent camera-landmark and gaze estimates kept in their histories.
    maxHistorySamples: 24,

    // Minimum estimates required before either position status can become stable.
    minHistorySamples: 5,

    // Maximum eye-center movement in camera-frame pixels before initial gaze
    // regression samples have enabled screen-coordinate predictions.
    landmarkMaxDeviationPx: 12,
  },

  gazeStability: {
    // Maximum screen-coordinate movement radius for the gaze estimate to be stable.
    maxDeviationPx: 75,
  },

  gaze: {
    // Weight of the newest raw gaze estimate in exponential smoothing.
    // Lower values are steadier; higher values respond faster.
    smoothingFactor: 0.3,

    // Interval at which WebGazer asks its model for a new estimate.
    dataTimestepMs: 50,

    // How long a missing WebGazer update remains usable before invalidation.
    freshnessTimeoutMs: 1200,

    // Maximum time allowed for the WebGazer script to load from each CDN.
    // Lower values prevent Start Tracking from appearing frozen on a blocked CDN.
    scriptLoadTimeoutMs: 8000,

    // Maximum time allowed for WebGazer to open the camera and initialise its model.
    cameraStartupTimeoutMs: 12000,

    // How long to wait after camera startup before showing recovery guidance
    // when no usable gaze update has arrived at all.
    startupSignalTimeoutMs: 2500,
  },

  diagnostics: {
    // Keep diagnostics on while investigating camera/gaze failures.
    enabled: true,

    // Log at most one raw gaze update per this many milliseconds.
    gazeLogIntervalMs: 500,

    // Keep enough events to include complete calibration and validation runs.
    maxEvents: 10000,
  },

  validationMetrics: {
    // Minimum validation samples needed before MAD outlier filtering.
    outlierMinSamples: 8,

    // Multiplier applied to the median absolute deviation (MAD).
    outlierMadMultiplier: 3.5,

    // Lower bound for outlier rejection distance, in pixels.
    outlierMinThresholdPx: 45,

    // Do not use filtering if it would retain less than this fraction.
    outlierMinimumRetainedFraction: 0.5,

    // Minimum number of retained samples required after filtering.
    outlierMinimumRetainedSamples: 5,

    // Validation tolerance as a fraction of the shorter viewport dimension.
    toleranceRatio: 0.16,

    // Minimum sample count required for an overall passing result.
    passMinimumSamples: 20,

    // Maximum median error as a fraction of the shorter viewport dimension.
    passMedianErrorRatio: 0.2,

    // Minimum percentage of samples that must be within tolerance to pass.
    passWithinTolerancePercent: 65,
  },
} as const;
