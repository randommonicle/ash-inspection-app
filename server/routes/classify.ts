import { Router, type Request, type Response } from 'express'
import { classifyNarration } from '../services/anthropic'
import { requireAuth } from '../middleware/auth'
import { classifyLimiter } from '../middleware/rateLimits'

const router = Router()

// Max narration length: 3 000 chars ≈ a 20-minute monologue at 150 wpm.
// A single 60-second recording at normal pace is ~150 words / ~900 chars.
// This prevents absurdly large inputs driving up Anthropic token costs.
const MAX_NARRATION_LENGTH = 3000

router.post('/', requireAuth, classifyLimiter, async (req: Request, res: Response) => {
  const { narration } = req.body as { narration?: string }

  if (!narration || typeof narration !== 'string' || narration.trim().length === 0) {
    console.warn('[CLASSIFY] Rejected: missing or empty narration')
    res.status(400).json({ error: 'narration is required' })
    return
  }

  const trimmed = narration.trim()

  if (trimmed.length > MAX_NARRATION_LENGTH) {
    console.warn(`[CLASSIFY] Rejected: narration too long (${trimmed.length} chars)`)
    res.status(400).json({ error: `narration must be ${MAX_NARRATION_LENGTH} characters or fewer` })
    return
  }

  console.log(`[CLASSIFY] User ${req.userId} — ${trimmed.length} chars: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}"`)

  try {
    const result = await classifyNarration(trimmed, { userId: req.userId })
    console.log(`[CLASSIFY] Result — section: ${result.section_key}, confidence: ${result.confidence}, split: ${result.split_required}`)
    res.json(result)
  } catch (err) {
    console.error('[CLASSIFY] Failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Classification failed' })
  }
})

export default router
