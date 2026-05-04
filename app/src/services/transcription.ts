// Deepgram Nova-3 batch transcription — routed via the ASH backend server.
//
// The server holds DEEPGRAM_API_KEY so it never appears in the APK bundle.
// The app sends the raw audio blob to POST /api/transcribe and receives
// { transcript: string } back.
//
// WHY xhrFetch?
//   CapacitorHttp patches window.fetch on Android. For binary blob uploads
//   its Promises never resolve, causing transcription to hang silently.
//   xhrFetch uses XHR directly which is unpatched and handles binary bodies.

import { xhrFetch } from './supabase'
import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL is not set — cannot reach transcription server')
  }

  // Retrieve the current Supabase session token for authentication.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated — please log in again')
  }

  // Use xhrFetch — not fetch — to avoid CapacitorHttp's patched window.fetch
  // hanging on binary blob uploads (see supabase.ts for full explanation).
  const response = await xhrFetch(`${API_BASE}/api/transcribe`, {
    method: 'POST',
    headers: {
      // Pass the audio MIME type so the server can forward it to Deepgram.
      // MediaRecorder produces audio/webm;codecs=opus, audio/webm, or audio/ogg.
      'Content-Type':  audioBlob.type || 'audio/webm',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: audioBlob,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Transcribe API ${response.status}: ${text}`)
  }

  const data = await response.json() as { transcript?: string }
  return (data.transcript ?? '').trim()
}
