import { Filesystem } from '@capacitor/filesystem'
import { supabase } from './supabase'
import {
  getUnsyncedCompletedInspections,
  getObservationsForInspection,
  getPhotosForInspection,
  markInspectionSynced,
} from '../db/database'
import type { LocalInspection } from '../types'

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

async function syncInspection(inspection: LocalInspection): Promise<void> {
  console.log(`[SYNC] Starting sync for inspection ${inspection.id} (${inspection.property_name})`)

  // 1. Upsert inspection record
  const { error: inspErr } = await supabase.from('inspections').upsert({
    id:           inspection.id,
    property_id:  inspection.property_id,
    inspector_id: inspection.inspector_id,
    status:       inspection.status,
    start_time:   inspection.start_time,
    end_time:     inspection.end_time ?? null,
    created_at:   inspection.created_at,
  }, { onConflict: 'id' })

  if (inspErr) {
    console.error(`[SYNC] Inspection upsert failed for ${inspection.id}:`, inspErr.message)
    throw new Error(`Inspection upsert: ${inspErr.message}`)
  }
  console.log(`[SYNC] Inspection record upserted`)

  // 2. Upsert observations
  const observations = await getObservationsForInspection(inspection.id)
  console.log(`[SYNC] Syncing ${observations.length} observations`)

  if (observations.length > 0) {
    const { error: obsErr } = await supabase.from('observations').upsert(
      observations.map(o => ({
        id:                  o.id,
        inspection_id:       o.inspection_id,
        property_id:         o.property_id,
        section_key:         o.section_key,
        template_order:      o.template_order,
        raw_narration:       o.raw_narration ?? null,
        processed_text:      o.processed_text ?? null,
        action_text:         o.action_text ?? null,
        risk_level:          o.risk_level ?? null,
        classification_conf: o.classification_conf ?? null,
        created_at:          o.created_at,
      })),
      { onConflict: 'id' }
    )
    if (obsErr) {
      console.error(`[SYNC] Observations upsert failed:`, obsErr.message)
      throw new Error(`Observations upsert: ${obsErr.message}`)
    }
    console.log(`[SYNC] ${observations.length} observations synced`)
  }

  // 3. Upload photos and upsert photo records
  const photos = await getPhotosForInspection(inspection.id)
  console.log(`[SYNC] Syncing ${photos.length} photos`)

  for (const photo of photos) {
    try {
      const storagePath = `${inspection.property_id}/${inspection.id}/${photo.id}.jpg`
      console.log(`[SYNC] Uploading photo ${photo.id} → ${storagePath}`)

      // Filesystem.readFile accepts file:// URIs on Android directly
      const { data: base64Data } = await Filesystem.readFile({ path: photo.local_path })
      const blob = base64ToBlob(base64Data as string, 'image/jpeg')

      const { error: uploadErr } = await supabase.storage
        .from('inspection-files')
        .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })

      if (uploadErr) {
        console.error(`[SYNC] Storage upload failed for photo ${photo.id}:`, uploadErr.message)
        throw new Error(`Storage upload: ${uploadErr.message}`)
      }

      const { error: photoErr } = await supabase.from('photos').upsert({
        id:             photo.id,
        observation_id: photo.observation_id ?? null,
        inspection_id:  photo.inspection_id,
        storage_path:   storagePath,
        local_path:     photo.local_path,
        caption:        photo.caption ?? null,
        created_at:     photo.created_at,
      }, { onConflict: 'id' })

      if (photoErr) {
        console.error(`[SYNC] Photo record upsert failed for ${photo.id}:`, photoErr.message)
        throw new Error(`Photo record upsert: ${photoErr.message}`)
      }

      console.log(`[SYNC] Photo ${photo.id} synced successfully`)
    } catch (err) {
      // Log per-photo failure but continue syncing remaining photos
      console.error(`[SYNC] Photo ${photo.id} sync failed — skipping:`, err instanceof Error ? err.message : err)
    }
  }

  await markInspectionSynced(inspection.id)
  console.log(`[SYNC] Inspection ${inspection.id} marked as synced`)
}

export async function syncPendingInspections(): Promise<void> {
  const inspections = await getUnsyncedCompletedInspections()

  if (inspections.length === 0) {
    console.log('[SYNC] No pending inspections to sync')
    return
  }

  console.log(`[SYNC] Found ${inspections.length} inspection(s) to sync`)

  for (const inspection of inspections) {
    await syncInspection(inspection).catch(err => {
      console.error(`[SYNC] Inspection ${inspection.id} sync failed:`, err instanceof Error ? err.message : err)
    })
  }

  console.log('[SYNC] Sync pass complete')
}
