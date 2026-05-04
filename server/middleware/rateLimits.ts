import rateLimit from 'express-rate-limit'

// Shared response body for all 429 responses
const tooMany = { error: 'Too many requests — please try again later' }

/**
 * Global limiter — applied to every route.
 * 200 requests per 15 minutes per IP is far more than any legitimate use case
 * but stops scripted floods instantly.
 */
export const globalLimiter = rateLimit({
  windowMs:      15 * 60 * 1000,
  max:           200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         tooMany,
})

/**
 * Classify — called once per voice recording.
 * An inspector recording fast might do ~3 observations/minute; 30 is very generous.
 */
export const classifyLimiter = rateLimit({
  windowMs:      60 * 1000,
  max:           30,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         tooMany,
})

/**
 * Analyse photo — called once per photo during sync.
 * An inspection with 60 photos syncing in one pass = 60 calls.
 * 80 per 10 minutes gives headroom while still bounding abuse.
 */
export const photoAnalysisLimiter = rateLimit({
  windowMs:      10 * 60 * 1000,
  max:           80,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         tooMany,
})

/**
 * Generate report — the most expensive endpoint (multiple Anthropic calls,
 * LibreOffice PDF conversion, Resend email). 10 per hour per IP is
 * generous for legitimate use (a PM won't regenerate 10 reports in an hour)
 * but caps runaway cost exposure.
 */
export const reportLimiter = rateLimit({
  windowMs:      60 * 60 * 1000,
  max:           10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         tooMany,
})
