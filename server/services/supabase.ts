import { createClient } from '@supabase/supabase-js'

const url        = process.env.SUPABASE_URL        ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

if (!url || !serviceKey) {
  console.error('[SUPABASE] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set')
}

// Service-role client — bypasses RLS. Only used server-side for Opus analysis and report generation.
export const supabase = createClient(url, serviceKey)
