// Update check hook — called once on app launch (after login).
//
// Fetches /api/version from the Railway server and compares the remote version
// against the version baked into this build at compile time (__APP_VERSION__).
// If the server has a newer version, returns the update info so the UI can
// show an update prompt.
//
// This never throws or blocks the app — a failed version check is silently
// swallowed. The app must always be usable even if the server is unreachable.
//
// To trigger an update prompt without redeploying:
//   1. Build new APK → upload to GitHub Releases → copy the asset URL
//   2. In Railway → set APP_VERSION, APK_URL, RELEASE_NOTES env vars
//   3. Railway redeploys → apps see the new version on next launch

import { useEffect, useState } from 'react'

export interface VersionInfo {
  version:      string
  apkUrl:       string | null
  releaseNotes: string
  forceUpdate:  boolean
}

/**
 * Semver greater-than: returns true if version string `a` is newer than `b`.
 * Handles standard MAJOR.MINOR.PATCH format. Non-numeric segments treated as 0.
 */
function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(s => parseInt(s, 10) || 0)
  const pb = b.split('.').map(s => parseInt(s, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL
    if (!apiBase) return

    fetch(`${apiBase}/api/version`, { signal: AbortSignal.timeout(8000) })
      .then(r => {
        if (!r.ok) return
        return r.json() as Promise<VersionInfo>
      })
      .then(remote => {
        if (!remote) return
        console.log(`[UPDATE] Installed: ${__APP_VERSION__} | Latest: ${remote.version}`)
        if (semverGt(remote.version, __APP_VERSION__)) {
          setUpdateInfo(remote)
        }
      })
      .catch(() => {
        // Non-fatal — offline, server down, or version check timed out
      })
  }, [])

  const dismiss = () => setUpdateInfo(null)

  return { updateInfo, dismiss }
}
