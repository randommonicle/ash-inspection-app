// Shown when the server reports a newer app version than the one installed.
// forceUpdate=true removes the dismiss button — use sparingly, only for
// breaking changes (e.g. a DB schema change that makes the old app unusable).
//
// Download flow: hands the APK URL to Capacitor's Browser plugin, which on
// Android explicitly launches Chrome Custom Tab. The Android download manager
// then picks up the APK and prompts installation. The first time, Android
// will ask the user to grant "Install unknown apps" to Chrome — that's a
// one-off per device.
//
// Why not window.open: on Capacitor 6 with androidScheme:'https', window.open
// can resolve INSIDE the WebView itself. The bytes download but the WebView
// has no concept of installing an APK, so the user sees a stuck 100% bar.
// Browser.open guarantees the handoff to an external browser.

import { useState } from 'react'
import { Browser } from '@capacitor/browser'
import type { VersionInfo } from '../hooks/useUpdateCheck'

interface Props {
  info: VersionInfo
  onDismiss: () => void
}

export function UpdatePrompt({ info, onDismiss }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [showHint,    setShowHint]    = useState(false)

  const handleDownload = async () => {
    if (!info.apkUrl) return
    setDownloading(true)
    try {
      await Browser.open({ url: info.apkUrl })
      // After Custom Tab opens, surface a hint in case Android doesn't auto-
      // prompt for install — the most common cause is missing "Install unknown
      // apps" permission for Chrome.
      setShowHint(true)
    } catch {
      // Web preview / non-Capacitor environment fallback. Should not happen
      // on a production device but keeps `npm run dev` workable.
      window.open(info.apkUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 px-4 pb-10">
      <div className="w-full bg-white rounded-2xl shadow-xl overflow-hidden">

        {/* Header strip */}
        <div className="bg-ash-navy px-5 py-4">
          <p className="text-white text-xs font-semibold uppercase tracking-widest opacity-70">
            ASH Inspection App
          </p>
          <h2 className="text-white text-xl font-bold mt-0.5">
            Update available
          </h2>
          <p className="text-ash-light text-sm mt-0.5">
            Version {info.version} is ready to install
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {info.releaseNotes ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                What's new
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {info.releaseNotes}
              </p>
            </div>
          ) : null}

          {info.forceUpdate && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-amber-500 text-base shrink-0">⚠</span>
              <p className="text-xs text-amber-700 leading-relaxed">
                This update is required — the app will not work correctly until it is installed.
              </p>
            </div>
          )}

          {/* Post-download hint — shown once the user has tapped Download. Most
              support calls about "the update doesn't install" are caused by
              the per-source "Install unknown apps" permission not being
              granted to Chrome on first run. */}
          {showHint && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-blue-900">After the download finishes</p>
              <p className="text-xs text-blue-800 leading-relaxed">
                Android may ask you to <strong>allow installs from Chrome</strong> — tap allow, then open the APK from your Downloads notification or Files app.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-2.5 pb-1">
            {info.apkUrl ? (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full py-4 rounded-xl bg-ash-navy text-white font-bold text-base active:scale-[0.98] transition disabled:opacity-60"
              >
                {downloading ? 'Opening download…' : 'Download & Install'}
              </button>
            ) : (
              <p className="text-xs text-gray-400 text-center">
                Contact your administrator to receive the update.
              </p>
            )}
            {!info.forceUpdate && (
              <button
                onClick={onDismiss}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 font-medium text-sm active:bg-gray-50 transition"
              >
                Remind me later
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
