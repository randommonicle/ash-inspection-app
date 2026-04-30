import Anthropic from '@anthropic-ai/sdk'
import { MODELS } from '../config/models'
import { CLASSIFY_PROMPT } from '../prompts/classify'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type SectionKey =
  | 'external_approach' | 'grounds' | 'bin_store' | 'car_park'
  | 'external_fabric' | 'roof' | 'communal_entrance' | 'stairwells'
  | 'lifts' | 'plant_room' | 'internal_communal' | 'additional'

export interface ClassifyResult {
  section_key: SectionKey
  confidence: 'high' | 'medium' | 'low'
  split_required: boolean
  split_at: number | null
}

export async function classifyNarration(narration: string): Promise<ClassifyResult> {
  console.log(`[ANTHROPIC] Calling ${MODELS.CLASSIFICATION} for classification`)

  const message = await client.messages.create({
    model: MODELS.CLASSIFICATION,
    max_tokens: 256,
    system: CLASSIFY_PROMPT,
    messages: [{ role: 'user', content: narration }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  // Claude occasionally wraps JSON in markdown code fences despite being told not to.
  // Strip them before parsing to avoid JSON.parse failures.
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  console.log(`[ANTHROPIC] Raw response: ${text.slice(0, 200)}`)

  try {
    const parsed = JSON.parse(text) as ClassifyResult
    return parsed
  } catch (err) {
    console.error('[ANTHROPIC] JSON parse failed. Raw response was:', raw)
    throw new Error(`Failed to parse classification response: ${err instanceof Error ? err.message : err}`)
  }
}
