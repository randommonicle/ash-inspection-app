// Drain the pending_transcriptions queue for one inspection.
//
// Each row represents an audio file written to local storage that has not yet
// been successfully transcribed. The row is created *before* transcription is
// attempted (see ActiveInspectionScreen.handleRecordingComplete) so an audio
// file can never outlive its bookkeeping — even if the app process is killed
// mid-upload.
//
// On success: the observation is written to local SQLite, the inspection is
// marked unsynced so the sync service re-uploads it, then the pending row +
// audio file are removed. On failure: the row + file are left in place for
// the next retry pass.

import { Filesystem } from '@capacitor/filesystem'
import { transcribeAudio } from './transcription'
import { classifyNarration } from './classify'
import {
  getPendingTranscriptions, deletePendingTranscription,
  createObservation, markInspectionUnsynced,
} from '../db/database'
import { SECTION_TEMPLATE_ORDER, type SectionKey } from '../types'

export interface RetryResult {
  /** Pending rows still queued after this pass (i.e. still failed). */
  remaining: number
  /** Pending rows that were successfully transcribed + saved this pass. */
  processed: number
}

export async function retryPendingTranscriptions(
  inspectionId: string,
  propertyId: string,
): Promise<RetryResult> {
  const queue = await getPendingTranscriptions(inspectionId)
  if (queue.length === 0) return { remaining: 0, processed: 0 }

  let processed = 0
  let createdAny = false

  for (const pt of queue) {
    try {
      const { data: base64 } = await Filesystem.readFile({ path: pt.audio_path })
      const binaryStr = atob(base64 as string)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'audio/webm' })

      const transcript = await transcribeAudio(blob)
      if (transcript) {
        let section: SectionKey = 'additional'
        try {
          const result = await classifyNarration(transcript)
          section = result.section_key
        } catch {
          // Classification failure is non-fatal — the transcript still has value.
        }
        await createObservation({
          inspection_id:       inspectionId,
          property_id:         propertyId,
          section_key:         section,
          template_order:      SECTION_TEMPLATE_ORDER[section],
          raw_narration:       transcript,
          classification_conf: 'auto',
        })
        createdAny = true
      }
      await deletePendingTranscription(pt.id)
      await Filesystem.deleteFile({ path: pt.audio_path }).catch(() => {})
      processed++
    } catch {
      // Still offline / transient failure — leave row + file in place.
    }
  }

  // The inspection may already be synced=1 (e.g. the PM completed it before
  // the network came back). Without this flag flip, the sync service skips it
  // and the newly-transcribed observations never reach Supabase, so the
  // server-side report generator never sees them.
  if (createdAny) {
    await markInspectionUnsynced(inspectionId)
  }

  const remaining = await getPendingTranscriptions(inspectionId)
  return { remaining: remaining.length, processed }
}
