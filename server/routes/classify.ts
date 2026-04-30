import { Router, type Request, type Response } from 'express'
import { classifyNarration } from '../services/anthropic'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const { narration } = req.body as { narration?: string }

  if (!narration || typeof narration !== 'string' || narration.trim().length === 0) {
    console.warn('[CLASSIFY] Rejected: missing or empty narration')
    res.status(400).json({ error: 'narration is required' })
    return
  }

  const trimmed = narration.trim()
  console.log(`[CLASSIFY] Request received — ${trimmed.length} chars: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}"`)

  try {
    const result = await classifyNarration(trimmed)
    console.log(`[CLASSIFY] Result — section: ${result.section_key}, confidence: ${result.confidence}, split: ${result.split_required}`)
    res.json(result)
  } catch (err) {
    console.error('[CLASSIFY] Failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Classification failed' })
  }
})

export default router
