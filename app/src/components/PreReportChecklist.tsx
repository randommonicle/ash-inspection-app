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
}

export function PreReportChecklist({ property, observations, photos, onConfirm, onCancel, onEditSection }: Props) {
  // Count observations per section
  const countsBySection = SECTION_ORDER.reduce<Record<SectionKey, number>>((acc, key) => {
    acc[key] = observations.filter(o => o.section_key === key).length
    return acc
  }, {} as Record<SectionKey, number>)

  // Count synced photos with an Opus-assigned section_key per section.
  // Only synced photos are counted — unsynced ones haven't been analysed by Opus yet.
  const photosBySection = SECTION_ORDER.reduce<Record<SectionKey, number>>((acc, key) => {
    acc[key] = photos.filter(p => p.synced && p.section_key === key).length
    return acc
  }, {} as Record<SectionKey, number>)

  // Synced photos whose section hasn't been assigned by Opus yet (analysis still in flight).
  // These will still appear in the report — the generator groups unclassified photos into
  // 'additional' — so they shouldn't block report generation.
  const pendingAnalysisCount = photos.filter(p => p.synced && !p.section_key).length
  const photosInFlight = pendingAnalysisCount > 0

  // Sections that are auto-N/A based on property flags or optional nature.
  // Lifts are intentionally NOT auto-N/A — they are safety-critical and the
  // inspector should always explicitly confirm whether they're applicable.
  const autoNA = new Set<SectionKey>()
  if (!property.has_car_park) autoNA.add('car_park')
  autoNA.add('additional') // always optional

  const [naSet, setNaSet] = useState<Set<SectionKey>>(() => {
    const initial = new Set<SectionKey>()
    for (const key of autoNA) {
      if (countsBySection[key] === 0) initial.add(key)
    }
    return initial
  })

  const toggleNA = (key: SectionKey) => {
    setNaSet(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const warningKeys = SECTION_ORDER.filter(key =>
    countsBySection[key] === 0 && photosBySection[key] === 0 && !naSet.has(key)
  )
  // Allow proceeding if photos are still being classified by Opus — the report
  // generator will handle unclassified photos and won't produce an empty report.
  const allOk = warningKeys.length === 0 || photosInFlight

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
            {photosInFlight
              ? `${pendingAnalysisCount} photo${pendingAnalysisCount !== 1 ? 's' : ''} uploaded — AI is classifying sections. Ready to generate.`
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
            const isWarn     = !covered && !isNA

            return (
              <div
                key={key}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  covered ? 'border-green-100 bg-green-50'
                  : isNA  ? 'border-gray-100 bg-gray-50'
                  :         'border-amber-100 bg-amber-50'
                }`}
              >
                {/* Status badge */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  covered ? 'bg-green-500 text-white'
                  : isNA  ? 'bg-gray-300 text-gray-600'
                  :         'bg-amber-400 text-white'
                }`}>
                  {covered ? '✓' : isNA ? '—' : '!'}
                </div>

                {/* Label + subtext */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    isNA && !covered ? 'text-gray-400' : 'text-gray-800'
                  }`}>
                    {SECTION_LABELS[key]}
                  </p>
                  {hasObs && (
                    <p className="text-xs text-gray-400">{obsCount} observation{obsCount !== 1 ? 's' : ''}{hasPhotos ? `, ${photoCount} photo${photoCount !== 1 ? 's' : ''}` : ''}</p>
                  )}
                  {!hasObs && hasPhotos && (
                    <p className="text-xs text-green-600">{photoCount} photo{photoCount !== 1 ? 's' : ''} — AI will describe</p>
                  )}
                  {isWarn && (
                    <p className="text-xs text-amber-600">No observations or photos</p>
                  )}
                  {isNA && !covered && (
                    <p className="text-xs text-gray-400">Not applicable</p>
                  )}
                </div>

                {/* Action buttons — only for uncovered sections */}
                {!covered && (
                  <div className="flex gap-1.5 shrink-0">
                    {isWarn && (
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
            {photosInFlight ? 'Generate Report →' : allOk ? 'Generate Report →' : `${warningKeys.length} unresolved`}
          </button>
        </div>
      </div>
    </div>
  )
}
