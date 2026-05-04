/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL: string
  // VITE_DEEPGRAM_API_KEY removed — transcription now goes via POST /api/transcribe
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
