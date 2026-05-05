import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// Pricing per million tokens (USD)
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15,  output: 75  },
  'claude-sonnet-4-6': { input: 3,   output: 15  },
  'claude-haiku-4-5':  { input: 0.8, output: 4   },
}

// Deepgram Nova-3: $0.0059/min → per second
const DEEPGRAM_COST_PER_SECOND = 0.0059 / 60

export function calcAnthropicCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = ANTHROPIC_PRICING[model] ?? { input: 3, output: 15 }
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

export function calcDeepgramCost(audioSeconds: number): number {
  return audioSeconds * DEEPGRAM_COST_PER_SECOND
}

export interface UsageEntry {
  service:       'anthropic' | 'deepgram'
  model:         string
  endpoint:      string
  inspection_id?: string | null
  user_id?:      string | null
  input_tokens?: number
  output_tokens?: number
  audio_seconds?: number
  cost_usd:      number
}

export function logUsage(entry: UsageEntry): void {
  supabase.from('api_usage_log').insert(entry).then(({ error }) => {
    if (error) console.error('[USAGE] Insert failed:', error.message)
  })
}
