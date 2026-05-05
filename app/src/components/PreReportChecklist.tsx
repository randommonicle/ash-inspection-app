import { useState } from 'react'
import type { LocalObservation, LocalPhoto, Property, SectionKey } from '../types'
import { SECTION_LABELS, SECTION_ORDER } from '../types'

interface Props {
  property: Property
  inspectionId: string
  observations: LocalObservation[]
  photos: LocalPhoto[]
  onConfirm: () => void
  onCancel: () => void
  onEditSection: (sectionKey: SectionKey) => void
  onUpdatePropertyFlag: (flag: 'has_car_park' | 'has_lift') => Promise<void>
}

// Sections that map to a property feature flag.
// Roof is intentionally excluded — inspector may fill it from ground level even without access.
const FLAG_SECTIONS: Partial<Record<SectionKey, { flag: 'has_car_park' | 'has_lift'; label: string }>> = {
  car_park: { flag: 'has_car_park', label: 'Car Park' },
  lifts:    { flag: 'has_lift',     label: 'Lifts'    },
}

// Which flag currently says this property HAS the feature
function propertyHasFeature(property: Property, flag: 'has_car_park' | 'has_lift'): boolean {
  return flag === 'has_car_park' ? property.has_car_park : property.has_lift
}

interface PendingFlag {
  section: SectionKey
  flag: 'has_car_park' | 'has_lift'
  label: string
}

export function PreReportChecklist({ property, observations, photos, onConfirm, onCancel, onEditSection, onUpdatePropertyFlag }: Props) {
  const isPhotosOnly = observations.length === 0 && photos.length > 0

  const countsBySection = SECTION_ORDER.reduce<Record<SectionKey, number>>((acc, key) => {
    acc[key] = observations.filter(o => o.section_key === key).length
    return acc
  }, {} as Record<SectionKey, number>)

  const photosBySection = SECTION_ORDER.reduce<Record<SectionKey, number>>((acc, key) => {
    acc[key] = photos.filter(p => p.synced && p.section_key === key).length
    return acc
  }, {} as Record<SectionKey, number>)

  const autoNA = new Set<SectionKey>()
  if (!property.has_car_park) autoNA.add('car_park')
  if (!property.has_lift)     autoNA.add('lifts')
  autoNA.add('additional')

  const [naSet, setNaSet] = useState<Set<SectionKey>>(() => {
    const initial = new Set<SectionKey>()
    for (const key of autoNA) {
      if (countsBySection[key] === 0) initial.add(key)
    }
    return initial
  })

  // Pending flag prompt — shown when inspector marks a feature-flagged section N/A
  // for a property that currently has that feature.
  const [pendingFlag, setPendingFlag] = useState<PendingFlag | null>(null)
  const [updatingFlag, setUpdatingFlag] = useState(false)

  const toggleNA = (key: SectionKey) => {
    setNaSet(prev => {
      const next = new Set(prev)
      const nowNA = !prev.has(key)
      if (nowNA) {
        next.add(key)
        // If this section maps to a property flag and the property currently has
        // that feature, ask whether to persist the update for all future inspections.
        const meta = FLAG_SECTIONS[key]
        if (meta && propertyHasFeature(property, meta.flag)) {
          setPendingFlag({ section: key, ...meta })
        }
      } else {
        next.delete(key)
        // If they undo the N/A, dismiss any pending flag prompt for this section
        if (pendingFlag?.section === key) setPendingFlag(null)
      }
      return next
    })
  }

  const handleAlwaysSkip = async () => {
    if (!pendingFlag) return
    setUpdatingFlag(true)
    try {
      await onUpdatePropertyFlag(pendingFlag.flag)
    } finally {
      setUpdatingFlag(false)
      setPendingFlag(null)
    }
  }

  const warningKeys = isPhotosOnly
    ? []
    : SECTION_ORDER.filter(key =>
        countsBySection[key] === 0 && photosBySection[key] === 0 && !naSet.has(key)
      )

  const allOk = warningKeys.length === 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
      <div
        className="mt-auto bg-white rounded-t-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-ash-navy">Pre-Report Checklist</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isPhotosOnly
              ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} captured — AI will classify and describe each area. Ready to generate.`
              : allOk
                ? 'All sections covered — ready to generate.'
                : `${warningKeys.length} section${warningKeys.length !== 1 ? 's' : ''} with no observations. Mark N/A or tap Edit to add notes.`
            }
          </p>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {SECTION_ORDER.map(key => {
            const obsCount   = countsBySection[key]
            const photoCount = photosBySection[key]
            const hasObs     = obsCount > 0
            const hasPhotos  = photoCount > 0
            const covered    = hasObs || hasPhotos
            const isNA       = naSet.has(key)
            const isWarn     = !covered && !isNA && !isPhotosOnly
            const isPending  = isPhotosOnly && !covered && !isNA

            return (
              <div key={key}>
                <div
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                    covered    ? 'border-green-100 bg-green-50'
                    : isNA     ? 'border-gray-100 bg-gray-50'
                    : isPending? 'border-blue-100 bg-blue-50'
                    :            'border-amber-100 bg-amber-50'
                  }`}
                >
                  {/* Status badge */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    covered    ? 'bg-green-500 text-white'
                    : isNA     ? 'bg-gray-300 text-gray-600'
                    : isPending? 'bg-blue-400 text-white'
                    :            'bg-amber-400 text-white'
                  }`}>
                    {covered ? '✓' : isNA ? '—' : isPending ? '?' : '!'}
                  </div>

                  {/* Label + subtext */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isNA && !covered ? 'text-gray-400' : 'text-gray-800'
                    }`}>
                      {SECTION_LABELS[key]}
                    </p>
                    {hasObs && (
                      <p className="text-xs text-gray-400">
                        {obsCount} observation{obsCount !== 1 ? 's' : ''}
                        {hasPhotos ? `, ${photoCount} photo${photoCount !== 1 ? 's' : ''}` : ''}
                      </p>
                    )}
                    {!hasObs && hasPhotos && (
                      <p className="text-xs text-green-600">{photoCount} photo{photoCount !== 1 ? 's' : ''} — AI will describe</p>
                    )}
                    {isPending && (
                      <p className="text-xs text-blue-500">AI will assign from photos</p>
                    )}
                    {isWarn && (
                      <p className="text-xs text-amber-600">No observations or photos</p>
                    )}
                    {isNA && !covered && (
                      <p className="text-xs text-gray-400">Not applicable</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!covered && (isPending || isWarn || isNA) && (
                    <div className="flex gap-1.5 shrink-0">
                      {(isPending || isWarn) && (
                        <button
                          onClick={() => onEditSection(key)}
                          className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-ash-navy text-white active:opacity-70 transition"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => toggleNA(key)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition active:scale-95 ${
                          isNA
                            ? 'bg-gray-200 text-gray-600 active:bg-gray-300'
                            : 'bg-amber-100 text-amber-700 active:bg-amber-200'
                        }`}
                      >
                        {isNA ? 'Undo' : 'N/A'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Feature-flag prompt — appears inline below the row */}
                {pendingFlag?.section === key && (
                  <div className="mt-1 mx-1 px-3 py-2.5 rounded-xl bg-ash-navy/5 border border-ash-navy/20">
                    <p className="text-xs font-semibold text-ash-navy mb-1">
                      Does this property have a {pendingFlag.label}?
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      Tap "No, never" to update the property record — this section will be skipped automatically on all future inspections.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAlwaysSkip}
                        disabled={updatingFlag}
                        className="flex-1 py-2 rounded-lg bg-ash-navy text-white text-xs font-semibold active:opacity-80 disabled:opacity-50"
                      >
                        {updatingFlag ? 'Saving…' : 'No, never'}
                      </button>
                      <button
                        onClick={() => setPendingFlag(null)}
                        className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold active:bg-gray-50"
                      >
                        Just this once
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 pb-8 flex gap-3 border-t border-gray-100 shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allOk}
            className="flex-1 py-3 rounded-xl bg-ash-navy text-white font-bold text-sm active:scale-[0.98] transition disabled:opacity-40"
          >
            {allOk ? 'Generate Report →' : `${warningKeys.length} unresolved`}
          </button>
        </div>
      </div>
    </div>
  )
}
