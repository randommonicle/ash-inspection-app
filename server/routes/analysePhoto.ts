import { Router, type Request, type Response } from 'express'
import { supabase } from '../services/supabase'
import { analyseImage } from '../services/anthropic'
import { resizeForReport } from '../services/imageProcessor'
import { requireAuth } from '../middleware/auth'
import { photoAnalysisLimiter } from '../middleware/rateLimits'

const router = Router()

router.post('/', requireAuth, photoAnalysisLimiter, async (req: Request, res: Response) => {
  const { photo_id, storage_path } = req.body as { photo_id?: string; storage_path?: string }

  if (!photo_id || typeof photo_id !== 'string' ||
      !storage_path || typeof storage_path !== 'string') {
    console.warn('[ANALYSE-PHOTO] Rejected: missing or invalid photo_id / storage_path')
    res.status(400).json({ error: 'photo_id and storage_path are required' })
    return
  }

  // Verify the photo belongs to the authenticated user — prevents one inspector
  // from triggering expensive Opus analysis on another inspector's photos.
  const { data: photoRow, error: photoLookupErr } = await supabase
    .from('photos')
    .select('id, inspection_id, inspections(inspector_id)')
    .eq('id', photo_id)
    .single()

  if (photoLookupErr || !photoRow) {
    console.warn(`[ANALYSE-PHOTO] Photo ${photo_id} not found or lookup failed`)
    res.status(404).json({ error: 'Photo not found' })
    return
  }

  const inspectorId = (photoRow.inspections as any)?.inspector_id
  if (inspectorId !== req.userId) {
    console.warn(`[ANALYSE-PHOTO] User ${req.userId} attempted to analyse photo belonging to ${inspectorId}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  console.log(`[ANALYSE-PHOTO] User ${req.userId} — analysing photo ${photo_id} at ${storage_path}`)

  try {
    // Download image from Supabase Storage as a buffer
    const { data, error: downloadErr } = await supabase.storage
      .from('inspection-files')
      .download(storage_path)

    if (downloadErr || !data) {
      console.error(`[ANALYSE-PHOTO] Download failed for ${storage_path}:`, downloadErr?.message)
      res.status(500).json({ error: 'Failed to download photo from storage' })
      return
    }

    const arrayBuffer = await data.arrayBuffer()
    // Resize before sending to Anthropic — vision API rejects anything over
    // 5 MB base64, which modern phone cameras routinely produce.
    const resized = await resizeForReport(Buffer.from(arrayBuffer))
    const base64  = resized.buffer.toString('base64')

    const result = await analyseImage(base64, 'image/jpeg', {
      userId:       req.userId,
      inspectionId: photoRow.inspection_id,
    })

    const { error: updateErr } = await supabase
      .from('photos')
      .update({ opus_description: result })
      .eq('id', photo_id)

    if (updateErr) {
      console.error(`[ANALYSE-PHOTO] Failed to save opus_description for ${photo_id}:`, updateErr.message)
      res.status(500).json({ error: 'Failed to save analysis result' })
      return
    }

    console.log(`[ANALYSE-PHOTO] Analysis complete for ${photo_id}: "${result.suggested_caption}"`)
    res.json(result)
  } catch (err) {
    console.error('[ANALYSE-PHOTO] Failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Image analysis failed' })
  }
})

export default router
