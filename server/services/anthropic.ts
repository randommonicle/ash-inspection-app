import Anthropic from '@anthropic-ai/sdk'
import { MODELS } from '../config/models'
import { CLASSIFY_PROMPT } from '../prompts/classify'
import { ANALYSE_IMAGE_PROMPT } from '../prompts/analyseImage'
import { logUsage, calcAnthropicCost } from './usageLogger'

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

export interface LogCtx {
  userId?:      string
  inspectionId?: string
}

export async function classifyNarration(narration: string, ctx?: LogCtx): Promise<ClassifyResult> {
  console.log(`[ANTHROPIC] Calling ${MODELS.CLASSIFICATION} for classification`)

  const message = await client.messages.create({
    model: MODELS.CLASSIFICATION,
    max_tokens: 256,
    system: CLASSIFY_PROMPT,
    messages: [{ role: 'user', content: narration }],
  })

  logUsage({
    service:       'anthropic',
    model:         MODELS.CLASSIFICATION,
    endpoint:      'classify',
    user_id:       ctx?.userId,
    inspection_id: ctx?.inspectionId,
    input_tokens:  message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cost_usd:      calcAnthropicCost(MODELS.CLASSIFICATION, message.usage.input_tokens, message.usage.output_tokens),
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
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

export interface ImageAnalysisResult {
  description: string
  notable_issues: string[]
  suggested_caption: string
  section_key?: string
}

export async function analyseImage(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png',
  ctx?: LogCtx,
): Promise<ImageAnalysisResult> {
  console.log(`[ANTHROPIC] Calling ${MODELS.IMAGE_ANALYSIS} for image analysis`)

  const message = await client.messages.create({
    model: MODELS.IMAGE_ANALYSIS,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Image },
        },
        {
          type: 'text',
          text: ANALYSE_IMAGE_PROMPT,
        },
      ],
    }],
  })

  logUsage({
    service:       'anthropic',
    model:         MODELS.IMAGE_ANALYSIS,
    endpoint:      'analyse-photo',
    user_id:       ctx?.userId,
    inspection_id: ctx?.inspectionId,
    input_tokens:  message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cost_usd:      calcAnthropicCost(MODELS.IMAGE_ANALYSIS, message.usage.input_tokens, message.usage.output_tokens),
  })

  const raw  = message.content[0].type === 'text' ? message.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  console.log(`[ANTHROPIC] Image analysis response: ${text.slice(0, 300)}`)

  try {
    return JSON.parse(text) as ImageAnalysisResult
  } catch (err) {
    console.error('[ANTHROPIC] Image analysis JSON parse failed. Raw response was:', raw)
    throw new Error(`Failed to parse image analysis response: ${err instanceof Error ? err.message : err}`)
  }
}
