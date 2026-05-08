// Shown when the server reports a newer app version than the one installed.
// forceUpdate=true removes the dismiss button — use sparingly, only for
// breaking changes (e.g. a DB schema change that makes the old app unusable).
//
// Download flow: opens the APK URL in a Chrome Custom Tab (Android's system
// browser). Android's download manager picks it up, downloads the APK, and
// prompts the user to install it. "Install from unknown sources" must be
// enabled once — PMs should already have done this when first sideloading.

import type { VersionInfo } from '../hooks/useUpdateCheck'

interface Props {
  info: VersionInfo
  onDismiss: () => void
}

export function UpdatePrompt({ info, onDismiss }: Props) {
  const handleDownload = () => {
    if (info.apkUrl) {
      // _blank opens Chrome Custom Tab on Android — the system download
      // manager intercepts the APK and prompts installation automatically.
      window.open(info.apkUrl, '_blank')
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

          {/* Buttons */}
          <div className="space-y-2.5 pb-1">
            {info.apkUrl ? (
              <button
                onClick={handleDownload}
                className="w-full py-4 rounded-xl bg-ash-navy text-white font-bold text-base active:scale-[0.98] transition"
              >
                Download &amp; Install
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
