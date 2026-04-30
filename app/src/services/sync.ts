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
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

async function syncInspection(inspection: LocalInspection): Promise<void> {
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
  if (inspErr) throw new Error(`Inspection upsert: ${inspErr.message}`)

  // 2. Upsert observations
  const observations = await getObservationsForInspection(inspection.id)
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
    if (obsErr) throw new Error(`Observations upsert: ${obsErr.message}`)
  }

  // 3. Upload photos and upsert photo records
  const photos = await getPhotosForInspection(inspection.id)
  for (const photo of photos) {
    try {
      const storagePath = `${inspection.property_id}/${inspection.id}/${photo.id}.jpg`

      // Read file — Filesystem.readFile accepts file:// URIs on Android
      const { data: base64Data } = await Filesystem.readFile({ path: photo.local_path })
      const blob = base64ToBlob(base64Data as string, 'image/jpeg')

      const { error: uploadErr } = await supabase.storage
        .from('inspection-files')
        .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`)

      const { error: photoErr } = await supabase.from('photos').upsert({
        id:             photo.id,
        observation_id: photo.observation_id ?? null,
        inspection_id:  photo.inspection_id,
        storage_path:   storagePath,
        local_path:     photo.local_path,
        caption:        photo.caption ?? null,
        created_at:     photo.created_at,
      }, { onConflict: 'id' })
      if (photoErr) throw new Error(`Photo record upsert: ${photoErr.message}`)
    } catch (err) {
      // Log per-photo failure but continue syncing remaining photos
      console.error(`Photo ${photo.id} sync failed:`, err)
    }
  }

  await markInspectionSynced(inspection.id)
}

export async function syncPendingInspections(): Promise<void> {
  const inspections = await getUnsyncedCompletedInspections()
  for (const inspection of inspections) {
    await syncInspection(inspection).catch(err => {
      console.error(`Inspection ${inspection.id} sync failed:`, err)
    })
  }
}
