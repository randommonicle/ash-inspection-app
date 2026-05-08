import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// __APP_VERSION__ is injected at build time from package.json so the app can
// compare itself against the version returned by /api/version and prompt the
// user to install an update. Bump package.json "version" with each release.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Capacitor apps serve assets locally from the device — there is no network
    // latency for large bundles, so the default 500 kB warning is not meaningful.
    // 2 MB is a more appropriate threshold for a native-wrapped app.
    chunkSizeWarningLimit: 2000,
  },
})
