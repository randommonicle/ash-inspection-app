// Single source of truth for all Claude model names used across the server.
// NEVER hardcode model strings in route or service files — always import from here.
// To upgrade a model or swap one task to a different tier, change it once here.
//
// Current routing rationale:
//   IMAGE_ANALYSIS uses Opus because it has the best vision accuracy for identifying
//   subtle property defects (cracks, staining, drainage issues). Cost is justified by
//   the legal significance of photographic evidence in a leasehold inspection report.
//
//   All text tasks use Sonnet — fast enough for real-time classification and cheap
//   enough to run on every observation and report without meaningful cost per inspection.
export const MODELS = {
  IMAGE_ANALYSIS: 'claude-opus-4-6',
  CLASSIFICATION: 'claude-sonnet-4-6',
  OBSERVATION:    'claude-sonnet-4-6',
  SUMMARY:        'claude-sonnet-4-6',
  COMPARISON:     'claude-sonnet-4-6',
} as const
