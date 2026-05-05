// Usage logger — records every paid API call to the api_usage_log table in Supabase.
// All inserts are fire-and-forget: we log a warning on failure but never throw.
// This means a logging failure will never break the operation that triggered it.
//
// If Anthropic or Deepgram change their pricing, update the constants below.
// The Admin dashboard's Costs & Usage tab reads from this table.

import { createClient } from '@supabase/supabase-js'

// Uses a separate Supabase client from the main server one so logging failures
// are isolated and cannot affect the main data flow.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// Pricing per million tokens (USD) — last verified May 2026
// Source: console.anthropic.com/settings/billing
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15,  output: 75  },
  'claude-sonnet-4-6': { input: 3,   output: 15  },
  'claude-haiku-4-5':  { input: 0.8, output: 4   },
}

// Deepgram Nova-3 pay-as-you-go: $0.0059/minute — last verified May 2026
// Source: deepgram.com/pricing
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
