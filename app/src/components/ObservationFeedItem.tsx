import type { LocalObservation, LocalPhoto } from '../types'
import { SECTION_LABELS } from '../types'

interface Props {
  observation: LocalObservation
  photos: LocalPhoto[]
  onOverride?: () => void
}

export function ObservationFeedItem({ observation, photos, onOverride }: Props) {
  const obsPhotos = photos.filter(p => p.observation_id === observation.id)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-ash-mid bg-ash-light px-2 py-0.5 rounded-full">
          {SECTION_LABELS[observation.section_key]}
        </span>
        {observation.classification_conf === 'manual' && (
          <span className="text-[10px] text-gray-400">edited</span>
        )}
        {onOverride && (
          <button
            onClick={onOverride}
            className="text-xs text-ash-mid font-medium px-2 py-0.5 rounded-md bg-ash-light active:opacity-60"
          >
            change
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
    </div>
  )
}
