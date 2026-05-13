// Backfill opus_description for photos that failed analysis at capture time
// (typically because the original was too large for Anthropic vision). Downloads
// each photo, resizes it, sends to vision, and saves the result.
//
// Usage:
//   npm run backfill-photos -- <inspection_id>
//   npm run backfill-photos -- --all                # every photo with NULL description across all inspections
//
// Requires .env with SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY.

import { supabase } from '../services/supabase'
import { analyseImage } from '../services/anthropic'
import { resizeForReport } from '../services/imageProcessor'

interface PhotoRow {
  id:            string
  inspection_id: string
  storage_path:  string | null
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: npm run backfill-photos -- <inspection_id>')
    console.error('   or: npm run backfill-photos -- --all')
    process.exit(1)
  }

  let query = supabase
    .from('photos')
    .select('id, inspection_id, storage_path')
    .is('opus_description', null)

  if (arg !== '--all') {
    query = query.eq('inspection_id', arg)
  }

  const { data: photos, error } = await query.returns<PhotoRow[]>()
  if (error) {
    console.error('Failed to fetch photos:', error.message)
    process.exit(1)
  }

  if (!photos || photos.length === 0) {
    console.log('No photos with missing opus_description found.')
    return
  }

  console.log(`Found ${photos.length} photo(s) to backfill.`)

  let ok   = 0
  let skip = 0
  let fail = 0

  for (const photo of photos) {
    if (!photo.storage_path) {
      console.warn(`[SKIP] Photo ${photo.id} has no storage_path`)
      skip++
      continue
    }

    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from('inspection-files')
        .download(photo.storage_path)

      if (dlErr || !file) {
        console.warn(`[SKIP] Photo ${photo.id} download failed: ${dlErr?.message ?? 'no data'}`)
        skip++
        continue
      }

      const raw     = Buffer.from(await file.arrayBuffer())
      const resized = await resizeForReport(raw)
      const base64  = resized.toString('base64')

      const result = await analyseImage(base64, 'image/jpeg', {
        inspectionId: photo.inspection_id,
      })

      const { error: updateErr } = await supabase
        .from('photos')
        .update({ opus_description: result })
        .eq('id', photo.id)

      if (updateErr) {
        console.error(`[FAIL] Photo ${photo.id} save failed: ${updateErr.message}`)
        fail++
        continue
      }

      console.log(`[OK]   Photo ${photo.id} (${raw.byteLength} → ${resized.byteLength} bytes): "${result.suggested_caption}"`)
      ok++
    } catch (err) {
      console.error(`[FAIL] Photo ${photo.id}:`, err instanceof Error ? err.message : err)
      fail++
    }
  }

  console.log(`\nDone. ok=${ok} skip=${skip} fail=${fail}`)
}

main().catch(err => {
  console.error('Backfill crashed:', err)
  process.exit(1)
})
