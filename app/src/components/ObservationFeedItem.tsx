import { useState } from 'react'
import type { LocalObservation, LocalPhoto } from '../types'
import { SECTION_LABELS } from '../types'

interface Props {
  observation: LocalObservation
  photos: LocalPhoto[]
  onOverride?: () => void
  onAppend?: () => void
  isAppendTarget?: boolean
  isPendingConfirmation?: boolean
  onDeletePhoto?: (photoId: string) => void
}

// 3+ photos all taken within 2 minutes = likely a burst of the same subject
function detectBurst(photos: LocalPhoto[]): boolean {
  if (photos.length < 3) return false
  const times = photos.map(p => new Date(p.created_at).getTime()).sort((a, b) => a - b)
  return times[times.length - 1] - times[0] < 120_000
}

export function ObservationFeedItem({ observation, photos, onOverride, onAppend, isAppendTarget, isPendingConfirmation, onDeletePhoto }: Props) {
  const obsPhotos = photos.filter(p => p.observation_id === observation.id)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<LocalPhoto | null>(null)

  const isBurst = detectBurst(obsPhotos)

  const handleDeleteFromFullscreen = (photo: LocalPhoto) => {
    setFullscreenPhoto(null)
    onDeletePhoto?.(photo.id)
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm px-4 py-3 transition-all ${
      isPendingConfirmation ? 'border-amber-400 ring-2 ring-amber-200' :
      isAppendTarget        ? 'border-ash-mid ring-2 ring-ash-mid/30' :
      'border-gray-100'
    }`}>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-ash-mid bg-ash-light px-2 py-0.5 rounded-full">
          {SECTION_LABELS[observation.section_key]}
        </span>
        {observation.classification_conf === 'manual' && (
          <span className="text-[10px] text-gray-400">edited</span>
        )}
        {onOverride && (
          <button
            onClick={onOverride}
            className="flex items-center gap-1 text-xs text-ash-navy font-semibold px-2.5 py-1.5 rounded-lg border border-ash-navy/25 bg-white active:bg-ash-light active:opacity-70 transition min-h-[36px]"
          >
            {/* Pencil icon */}
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
            </svg>
            Change section
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-400">
          {new Date(observation.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed">{observation.raw_narration}</p>

      {obsPhotos.length > 0 && (
        <>
          {/* Burst warning */}
          {isBurst && (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-amber-500 text-sm">⚠</span>
              <p className="text-xs text-amber-700 font-medium">
                {obsPhotos.length} similar photos — tap × to remove duplicates before generating
              </p>
            </div>
          )}

          {/* Thumbnail strip */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {obsPhotos.map(photo => (
              <div key={photo.id} className="relative shrink-0">
                <button
                  onClick={() => setFullscreenPhoto(photo)}
                  className="active:opacity-80 transition"
                >
                  <img
                    src={photo.web_path ?? photo.local_path}
                    alt="Inspection photo"
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                  />
                </button>
                {onDeletePhoto && (
                  <button
                    onClick={() => onDeletePhoto(photo.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center active:bg-red-600 transition shadow-sm"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Fullscreen viewer */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onClick={() => setFullscreenPhoto(null)}
        >
          {/* Top bar */}
          <div className="flex justify-between items-center p-4 shrink-0">
            {onDeletePhoto ? (
              <button
                onClick={e => { e.stopPropagation(); handleDeleteFromFullscreen(fullscreenPhoto) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-semibold active:bg-red-500 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Delete
              </button>
            ) : <div />}
            <button
              onClick={() => setFullscreenPhoto(null)}
              className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:bg-white/30 transition"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Photo */}
          <div className="flex-1 flex items-center justify-center px-4 min-h-0">
            <img
              src={fullscreenPhoto.web_path ?? fullscreenPhoto.local_path}
              alt="Inspection photo"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Caption */}
          {fullscreenPhoto.caption && (
            <div className="px-6 py-4 shrink-0" onClick={e => e.stopPropagation()}>
              <p className="text-white/80 text-sm text-center italic">{fullscreenPhoto.caption}</p>
            </div>
          )}
          <div className="pb-8" />
        </div>
      )}

      {onAppend && (
        <button
          onClick={onAppend}
          className={`mt-2 w-full py-2 rounded-lg text-xs font-semibold transition active:opacity-70 flex items-center justify-center gap-1.5 ${
            isAppendTarget
              ? 'bg-ash-navy text-white'
              : 'bg-ash-light text-ash-navy'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {isAppendTarget ? 'Recording will continue this observation…' : 'Add more to this observation'}
        </button>
      )}
    </div>
  )
}
