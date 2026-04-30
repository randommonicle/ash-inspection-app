// Central model routing config — the ONLY place model names appear in the codebase.
// Per spec section 6: image analysis always uses Opus, everything else Sonnet.
export const MODELS = {
  IMAGE_ANALYSIS: 'claude-opus-4-6',   // Opus — all photo analysis
  CLASSIFICATION: 'claude-sonnet-4-6', // Sonnet — section classification
  OBSERVATION:    'claude-sonnet-4-6', // Sonnet — text processing
  SUMMARY:        'claude-sonnet-4-6', // Sonnet — overall summary
  COMPARISON:     'claude-sonnet-4-6', // Sonnet — recurring items
} as const
