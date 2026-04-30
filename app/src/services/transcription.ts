// Deepgram Nova-3 batch transcription (REST API)
// Phase 2: called directly from the app after each recording chunk.
// Phase 4: will be routed through the backend server when the sync
//           architecture is in place and the API key moves server-side.

import { xhrFetch } from './supabase'

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const params = new URLSearchParams({
    model:        'nova-3',
    language:     'en-GB',
    punctuate:    'true',
    smart_format: 'true',
  })

  // Use xhrFetch instead of fetch — CapacitorHttp patches window.fetch on Android
  // and its Promises never resolve, causing the transcription to hang silently.
  const response = await xhrFetch(`${DEEPGRAM_URL}?${params}`, {
    method: 'POST',
    headers: {
      Authorization:  `Token ${import.meta.env.VITE_DEEPGRAM_API_KEY}`,
      'Content-Type': audioBlob.type || 'audio/webm',
    },
    body: audioBlob,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Deepgram ${response.status}: ${text}`)
  }

  const data = await response.json()
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  return transcript.trim()
}
