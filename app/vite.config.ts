import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Capacitor apps serve assets locally from the device — there is no network
    // latency for large bundles, so the default 500 kB warning is not meaningful.
    // 2 MB is a more appropriate threshold for a native-wrapped app.
    chunkSizeWarningLimit: 2000,
  },
})
