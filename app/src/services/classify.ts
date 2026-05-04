import type { SectionKey } from '../types'
import { authHeaders } from './apiClient'

export interface ClassifyResult {
  section_key: SectionKey
  confidence: 'high' | 'medium' | 'low'
  split_required: boolean
  split_at: number | null
}

export async function classifyNarration(narration: string): Promise<ClassifyResult> {
  const base = import.meta.env.VITE_API_BASE_URL as string

  if (!base) {
    console.error('[CLASSIFY] VITE_API_BASE_URL is not set — cannot reach classification server')
    throw new Error('API base URL not configured')
  }

  console.log(`[CLASSIFY] Sending ${narration.length} chars to ${base}/api/classify`)

  const res = await fetch(`${base}/api/classify`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ narration }),
  })

  if (!res.ok) {
    console.error(`[CLASSIFY] Server returned ${res.status}`)
    throw new Error(`Classify API ${res.status}`)
  }

  const result = await res.json() as ClassifyResult
  console.log(`[CLASSIFY] Received: section=${result.section_key} confidence=${result.confidence} split=${result.split_required}`)
  return result
}
