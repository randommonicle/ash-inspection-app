/// <reference types="vite/client" />

// Injected at build time by vite.config.ts from package.json "version".
// Used by useUpdateCheck to compare against the server's current release.
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL: string
  // VITE_DEEPGRAM_API_KEY removed — transcription now goes via POST /api/transcribe
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
