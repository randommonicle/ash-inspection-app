// Background sync service — uploads completed inspections to Supabase.
//
// Sync order matters: inspection → observations → photos (in that order) because
// the Supabase foreign key constraints require the parent row to exist first.
//
// Per-photo failures are swallowed and logged but do not abort the whole sync.
// This means a corrupt or oversized photo will never block the rest of the data.
//
// After each photo uploads successfully, Opus image analysis is triggered
// server-side. The resulting caption and section_key are written back to SQLite
// so the local viewer can display them without a round-trip to Supabase.
//
// syncPendingInspections() is the only public entry point. Call it:
//   - when the app comes back online (useNetwork hook)
//   - when the user manually taps "Sync"
//   - on app resume / foreground event

import { Filesystem } from '@capacitor/filesystem'
import { supabase } from './supabase'
import { authHeaders } from './apiClient'
import {
  getUnsyncedCompletedInspections,
  getObservationsForInspection,
  getPhotosForInspection,
  markInspectionSynced,
  updatePhotoAnalysis,
} from '../db/database'
import type { LocalInspection } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

async function triggerOpusAnalysis(photoId: string, storagePath: string): Promise<void> {
  if (!API_BASE) {
    console.warn('[SYNC] VITE_API_BASE_URL not set — skipping Opus analysis')
    return
  }
  console.log(`[SYNC] Triggering Opus analysis for photo ${photoId}`)
  const res = await fetch(`${API_BASE}/api/analyse-photo`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ photo_id: photoId, storage_path: storagePath }),
  })
  if (!res.ok) {
    console.error(`[SYNC] Opus analysis failed for ${photoId}: HTTP ${res.status}`)
    return
  }
  // Write the suggested_caption back to local SQLite so the fullscreen viewer
  // can show it without needing a separate Supabase fetch.
  try {
    const result = await res.json() as { suggested_caption?: string; section_key?: string }
    if (result.suggested_caption || result.section_key) {
      await updatePhotoAnalysis(photoId, result.suggested_caption ?? '', result.section_key)
      console.log(`[SYNC] Analysis saved locally for ${photoId}: section=${result.section_key ?? '?'}, caption="${result.suggested_caption ?? ''}"`)
    }
  } catch {
    // Non-fatal — caption and section_key just won't be available locally for this photo
  }
}

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

      // Trigger Opus image analysis server-side after successful upload
      await triggerOpusAnalysis(photo.id, storagePath)

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
