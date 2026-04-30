import { Router, type Request, type Response } from 'express'
import { supabase } from '../services/supabase'
import { analyseImage } from '../services/anthropic'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const { photo_id, storage_path } = req.body as { photo_id?: string; storage_path?: string }

  if (!photo_id || !storage_path) {
    console.warn('[ANALYSE-PHOTO] Rejected: missing photo_id or storage_path')
    res.status(400).json({ error: 'photo_id and storage_path are required' })
    return
  }

  console.log(`[ANALYSE-PHOTO] Analysing photo ${photo_id} at ${storage_path}`)

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

    // Convert blob to base64 for the Anthropic API
    const arrayBuffer = await data.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const result = await analyseImage(base64, 'image/jpeg')

    // Save result to Supabase photos table
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
