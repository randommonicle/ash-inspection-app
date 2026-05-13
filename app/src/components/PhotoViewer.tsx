// Full-screen photo viewer with optional delete + caption.
//
// Used in two places:
//   1. ObservationFeedItem — tap any thumbnail attached to an observation
//   2. ActiveInspectionScreen — tap any thumbnail in the "Unlinked photos" strip
//
// Caption falls back to opus_description.suggested_caption (which is what
// gets saved into `caption` via updatePhotoAnalysis after sync). If there's
// nothing to show, the caption block is hidden entirely.

import type { LocalPhoto } from '../types'

interface Props {
  photo:        LocalPhoto
  onClose:      () => void
  onDelete?:    (photoId: string) => void
}

export function PhotoViewer({ photo, onClose, onDelete }: Props) {
  const handleDelete = () => {
    onClose()
    onDelete?.(photo.id)
  }

  const caption = photo.caption?.trim() || ''

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="flex justify-between items-center p-4 shrink-0">
        {onDelete ? (
          <button
            onClick={e => { e.stopPropagation(); handleDelete() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-semibold active:bg-red-500 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Delete
          </button>
        ) : <div />}
        <button
          onClick={onClose}
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
          src={photo.web_path ?? photo.local_path}
          alt={caption || 'Inspection photo'}
          className="max-w-full max-h-full object-contain rounded-lg"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Caption */}
      {caption && (
        <div className="px-6 py-4 shrink-0" onClick={e => e.stopPropagation()}>
          <p className="text-white/80 text-sm text-center italic">{caption}</p>
        </div>
      )}
      <div className="pb-8" />
    </div>
  )
}
