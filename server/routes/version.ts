import { Router } from 'express'

const router = Router()

// Public endpoint — no auth required so the app can check for updates before login.
// All values are driven by Railway environment variables so Ben can push an update
// notification without redeploying code:
//
//   APP_VERSION    The latest released version, e.g. "0.3.0"
//   APK_URL        Direct download link to the APK (GitHub release asset URL)
//   RELEASE_NOTES  Short plain-text description shown in the update prompt
//   FORCE_UPDATE   Set to "true" to prevent use of the app until updated
//
// Workflow to push an update notification:
//   1. Build APK → upload to GitHub release as an asset → copy the asset download URL
//   2. In Railway → Variables: set APP_VERSION, APK_URL, RELEASE_NOTES
//   3. Railway auto-redeploys → apps see the new version on next launch
//
// No code change or deployment is needed for step 3 — just env var updates.

router.get('/', (_req, res) => {
  res.json({
    version:      process.env.APP_VERSION   ?? '0.0.0',
    apkUrl:       process.env.APK_URL       ?? null,
    releaseNotes: process.env.RELEASE_NOTES ?? '',
    forceUpdate:  process.env.FORCE_UPDATE  === 'true',
  })
})

export default router
