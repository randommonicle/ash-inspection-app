/**
 * POST /api/transcribe
 *
 * Accepts a raw audio body (webm/opus, webm, or ogg — whatever MediaRecorder
 * produced on the device) and forwards it to Deepgram Nova-3 server-side.
 * Returns { transcript: string }.
 *
 * IMPORTANT: This route is mounted in index.ts BEFORE express.json() so that
 * the raw audio buffer is not clobbered by the JSON body parser. The route
 * uses express.raw() to receive binary data up to 25 MB.
 *
 * The Content-Type from the app is passed through to Deepgram so it knows the
 * audio codec (audio/webm;codecs=opus, audio/webm, or audio/ogg).
 */

import express, { type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { transcribeLimiter } from '../middleware/rateLimits'
import { logUsage, calcDeepgramCost } from '../services/usageLogger'

const router = express.Router()

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

const DEEPGRAM_PARAMS = new URLSearchParams({
  model:        'nova-3',
  language:     'en-GB',
  punctuate:    'true',
  smart_format: 'true',
}).toString()

router.post(
  '/',
  // Raw body parser — must come BEFORE requireAuth so the body is available.
  // 25 MB limit: a 60-second webm/opus recording is typically 200–600 KB,
  // but we allow headroom for uncompressed ogg fallback.
  express.raw({ type: '*/*', limit: '25mb' }),
  requireAuth,
  transcribeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      console.error('[TRANSCRIBE] DEEPGRAM_API_KEY is not set')
      res.status(500).json({ error: 'Transcription service not configured' })
      return
    }

    const audioBuffer = req.body as Buffer
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      res.status(400).json({ error: 'Audio body is empty or missing' })
      return
    }

    // Pass through the Content-Type the app sent — Deepgram needs it to know the codec.
    const contentType = (req.headers['content-type'] as string | undefined) || 'audio/webm'

    console.log(`[TRANSCRIBE] Forwarding ${audioBuffer.length} bytes (${contentType}) to Deepgram for user ${req.userId}`)

    const dgRes = await fetch(`${DEEPGRAM_URL}?${DEEPGRAM_PARAMS}`, {
      method:  'POST',
      headers: {
        Authorization:  `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: new Uint8Array(audioBuffer),
    })

    if (!dgRes.ok) {
      const text = await dgRes.text().catch(() => '')
      console.error(`[TRANSCRIBE] Deepgram error ${dgRes.status}: ${text}`)
      res.status(502).json({ error: `Deepgram error ${dgRes.status}` })
      return
    }

    const data = await dgRes.json() as {
      metadata?: { duration?: number }
      results?:  { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> }
    }

    const transcript: string =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

    const audioSeconds = data?.metadata?.duration ?? 0
    if (audioSeconds > 0) {
      logUsage({
        service:       'deepgram',
        model:         'nova-3',
        endpoint:      'transcribe',
        user_id:       req.userId,
        audio_seconds: audioSeconds,
        cost_usd:      calcDeepgramCost(audioSeconds),
      })
    }

    console.log(`[TRANSCRIBE] Done — ${transcript.length} chars returned`)
    res.json({ transcript: transcript.trim() })
  }
)

export default router
