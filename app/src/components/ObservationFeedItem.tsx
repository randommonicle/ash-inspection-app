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
}

export function ObservationFeedItem({ observation, photos, onOverride, onAppend, isAppendTarget }: Props) {
  const obsPhotos = photos.filter(p => p.observation_id === observation.id)

  return (
    <div className={`bg-white rounded-xl border shadow-sm px-4 py-3 transition-all ${
      isAppendTarget ? 'border-ash-mid ring-2 ring-ash-mid/30' : 'border-gray-100'
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
            <img
              key={photo.id}
              src={photo.web_path ?? photo.local_path}
              alt="Inspection photo"
              className="w-20 h-20 object-cover rounded-lg border border-gray-200"
            />
          ))}
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
