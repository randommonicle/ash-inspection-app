import { useState } from 'react'
import type { LocalObservation, LocalPhoto } from '../types'
import { SECTION_LABELS } from '../types'

interface Props {
  observation: LocalObservation
  photos: LocalPhoto[]
  onOverride?: () => void
  /** When provided, shows an "add more" button to continue this observation */
  onAppend?: () => void
  /** Highlight this card as the active append target */
  isAppendTarget?: boolean
  /** Highlight this card as the one awaiting confidence confirmation */
  isPendingConfirmation?: boolean
}

export function ObservationFeedItem({ observation, photos, onOverride, onAppend, isAppendTarget, isPendingConfirmation }: Props) {
  const obsPhotos = photos.filter(p => p.observation_id === observation.id)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<LocalPhoto | null>(null)

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
            className="text-xs text-ash-mid font-medium px-3 py-1.5 rounded-md bg-ash-light active:opacity-60 min-h-[36px]"
          >
            change section
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-400">
          {new Date(observation.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed">{observation.raw_narration}</p>

      {obsPhotos.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {obsPhotos.map(photo => (
            <button
              key={photo.id}
              onClick={() => setFullscreenPhoto(photo)}
              className="shrink-0 active:opacity-80 transition"
            >
              <img
                src={photo.web_path ?? photo.local_path}
                alt="Inspection photo"
                className="w-20 h-20 object-cover rounded-lg border border-gray-200"
              />
            </button>
          ))}
        </div>
      )}

      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onClick={() => setFullscreenPhoto(null)}
        >
          {/* Close button */}
          <div className="flex justify-end p-4 shrink-0">
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
