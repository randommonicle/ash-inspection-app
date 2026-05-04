import { useState } from 'react'
import type { LocalObservation, Property, SectionKey } from '../types'
import { SECTION_LABELS, SECTION_ORDER } from '../types'

interface Props {
  property: Property
  inspectionId: string
  observations: LocalObservation[]
  onConfirm: () => void
  onCancel: () => void
  onEditSection: (sectionKey: SectionKey) => void
}

export function PreReportChecklist({ property, observations, onConfirm, onCancel, onEditSection }: Props) {
  // Count observations per section
  const countsBySection = SECTION_ORDER.reduce<Record<SectionKey, number>>((acc, key) => {
    acc[key] = observations.filter(o => o.section_key === key).length
    return acc
  }, {} as Record<SectionKey, number>)

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

  const warningKeys = SECTION_ORDER.filter(key => countsBySection[key] === 0 && !naSet.has(key))
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
            {allOk
              ? 'All sections covered — ready to generate.'
              : `${warningKeys.length} section${warningKeys.length !== 1 ? 's' : ''} with no observations. Mark N/A or tap Edit to add notes.`
            }
          </p>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {SECTION_ORDER.map(key => {
            const count  = countsBySection[key]
            const hasObs = count > 0
            const isNA   = naSet.has(key)
            const isWarn = !hasObs && !isNA

            return (
              <div
                key={key}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  hasObs ? 'border-green-100 bg-green-50'
                  : isNA  ? 'border-gray-100 bg-gray-50'
                  :         'border-amber-100 bg-amber-50'
                }`}
              >
                {/* Status badge */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  hasObs  ? 'bg-green-500 text-white'
                  : isNA  ? 'bg-gray-300 text-gray-600'
                  :         'bg-amber-400 text-white'
                }`}>
                  {hasObs ? '✓' : isNA ? '—' : '!'}
                </div>

                {/* Label + subtext */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    isNA && !hasObs ? 'text-gray-400' : 'text-gray-800'
                  }`}>
                    {SECTION_LABELS[key]}
                  </p>
                  {hasObs && (
                    <p className="text-xs text-gray-400">{count} observation{count !== 1 ? 's' : ''}</p>
                  )}
                  {isWarn && (
                    <p className="text-xs text-amber-600">No observations recorded</p>
                  )}
                  {isNA && !hasObs && (
                    <p className="text-xs text-gray-400">Not applicable</p>
                  )}
                </div>

                {/* Action buttons — only for sections with no observations */}
                {!hasObs && (
                  <div className="flex gap-1.5 shrink-0">
                    {/* Edit — go back to inspection, jump to this section */}
                    {isWarn && (
                      <button
                        onClick={() => onEditSection(key)}
                        className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-ash-navy text-white active:opacity-70 transition"
                      >
                        Edit
                      </button>
                    )}
                    {/* N/A toggle */}
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
            {allOk ? 'Generate Report →' : `${warningKeys.length} unresolved`}
          </button>
        </div>
      </div>
    </div>
  )
}
