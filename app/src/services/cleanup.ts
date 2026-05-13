// Local-storage cleanup helpers.
//
// freeLocalPhotos() runs after a report has been successfully emailed. Photos
// are already in Supabase Storage at that point — the server downloads them
// from there for both the initial report and any future regeneration. The
// on-device JPEGs and the SQLite photo rows are pure UI cache and can be
// safely removed to reclaim space on the phone.

import { Filesystem } from '@capacitor/filesystem'
import { getPhotosForInspection, deletePhotosForInspection } from '../db/database'

export interface CleanupResult {
  deleted:    number
  freedBytes: number
}

export async function freeLocalPhotos(inspectionId: string): Promise<CleanupResult> {
  const photos = await getPhotosForInspection(inspectionId)
  if (photos.length === 0) return { deleted: 0, freedBytes: 0 }

  let freedBytes = 0
  for (const photo of photos) {
    if (!photo.local_path) continue
    try {
      const stat = await Filesystem.stat({ path: photo.local_path })
      freedBytes += stat.size ?? 0
    } catch {
      // File may already be gone — stat failure is non-fatal
    }
    await Filesystem.deleteFile({ path: photo.local_path }).catch(() => {})
  }

  await deletePhotosForInspection(inspectionId)
  return { deleted: photos.length, freedBytes }
}

export function formatFreedBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
