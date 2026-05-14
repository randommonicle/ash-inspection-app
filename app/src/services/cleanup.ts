// Local-storage cleanup helpers.
//
// freeLocalPhotos() runs after a report has been successfully emailed, to
// reclaim space on the phone. It is DESTRUCTIVE — it deletes the on-device
// JPEGs — so it verifies every photo against Supabase first and will only
// delete a local file that is *confirmed* present in the cloud.
//
// History: an earlier version deleted every local photo unconditionally,
// trusting that sync had succeeded. When a flaky-signal sync failed to upload
// photos but the inspection was still marked synced, that version destroyed
// the only remaining copies. This version never deletes an unconfirmed photo —
// better to use a little phone storage than to lose an inspection's evidence.

import { Filesystem } from '@capacitor/filesystem'
import { supabase } from './supabase'
import { getPhotosForInspection, deletePhoto } from '../db/database'

export interface CleanupResult {
  deleted:    number
  freedBytes: number
  kept:       number   // photos left on the phone because they weren't confirmed in Supabase
}

export async function freeLocalPhotos(inspectionId: string): Promise<CleanupResult> {
  const photos = await getPhotosForInspection(inspectionId)
  if (photos.length === 0) return { deleted: 0, freedBytes: 0, kept: 0 }

  // Verify against Supabase before destroying anything. A photo is only safe to
  // delete locally if it has a photos-table row WITH a storage_path — i.e. it
  // genuinely reached the cloud.
  const { data: remote, error } = await supabase
    .from('photos')
    .select('id, storage_path')
    .eq('inspection_id', inspectionId)

  if (error) {
    // Could not verify — do nothing. Never delete on a failed check.
    console.warn('[CLEANUP] Could not verify photos against Supabase — skipping cleanup to be safe:', error.message)
    return { deleted: 0, freedBytes: 0, kept: photos.length }
  }

  const confirmed = new Set(
    (remote ?? []).filter(r => r.storage_path).map(r => r.id),
  )

  let deleted    = 0
  let kept       = 0
  let freedBytes = 0

  for (const photo of photos) {
    if (!confirmed.has(photo.id)) {
      // Not confirmed in the cloud — keep it on the phone.
      kept++
      continue
    }

    if (photo.local_path) {
      try {
        const stat = await Filesystem.stat({ path: photo.local_path })
        freedBytes += stat.size ?? 0
      } catch {
        // File may already be gone — stat failure is non-fatal
      }
      await Filesystem.deleteFile({ path: photo.local_path }).catch(() => {})
    }

    // Remove only the rows we actually deleted files for — never a blanket
    // delete-by-inspection, so kept-back photos retain their local record and
    // will be re-checked on the next cleanup.
    await deletePhoto(photo.id)
    deleted++
  }

  if (kept > 0) {
    console.warn(`[CLEANUP] Kept ${kept} photo(s) for inspection ${inspectionId} on the phone — not confirmed in Supabase`)
  }

  return { deleted, freedBytes, kept }
}

export function formatFreedBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
