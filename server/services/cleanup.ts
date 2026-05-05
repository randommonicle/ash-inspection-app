import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'

// Uses the service-role key so it can bypass RLS and access all inspections
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const RETENTION_MONTHS = 12
const STORAGE_BUCKET   = 'inspection-files'

async function deleteOldPhotos(): Promise<void> {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS)
  const cutoffISO = cutoff.toISOString()

  console.log(`[CLEANUP] Starting photo retention pass — deleting Storage files for inspections before ${cutoffISO}`)

  // Find all inspections older than the retention window
  const { data: inspections, error } = await supabase
    .from('inspections')
    .select('id, property_id, end_time')
    .lt('end_time', cutoffISO)
    .eq('status', 'completed')

  if (error) {
    console.error('[CLEANUP] Failed to query old inspections:', error.message)
    return
  }

  if (!inspections || inspections.length === 0) {
    console.log('[CLEANUP] No inspections older than retention window — nothing to delete')
    return
  }

  console.log(`[CLEANUP] Found ${inspections.length} inspection(s) to clean up`)
  let deletedFiles = 0

  for (const ins of inspections) {
    const prefix = `${ins.property_id}/${ins.id}/`

    // List all files under this inspection's storage prefix
    const { data: files, error: listErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`${ins.property_id}/${ins.id}`)

    if (listErr) {
      console.error(`[CLEANUP] Failed to list files for ${ins.id}:`, listErr.message)
      continue
    }

    if (!files || files.length === 0) continue

    const paths = files.map(f => `${prefix}${f.name}`)
    const { error: removeErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(paths)

    if (removeErr) {
      console.error(`[CLEANUP] Failed to delete files for ${ins.id}:`, removeErr.message)
    } else {
      deletedFiles += paths.length
      console.log(`[CLEANUP] Deleted ${paths.length} file(s) for inspection ${ins.id}`)
    }
  }

  console.log(`[CLEANUP] Pass complete — ${deletedFiles} file(s) removed across ${inspections.length} inspection(s)`)
}

export function startCleanupSchedule(): void {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('[CLEANUP] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — cleanup cron disabled')
    return
  }

  // Run at 03:00 on the 1st of every month
  cron.schedule('0 3 1 * *', () => {
    deleteOldPhotos().catch(err => {
      console.error('[CLEANUP] Unhandled error in cleanup pass:', err instanceof Error ? err.message : err)
    })
  })

  console.log('[STARTUP] Photo retention cron scheduled (monthly, 1st at 03:00)')
}
