import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getInspectionsForProperty, createInspection, deleteInspection, markReportSent, getObservationsForInspection } from '../db/database'
import { generateReport } from '../services/report'
import { PreReportChecklist } from '../components/PreReportChecklist'
import type { Property, LocalInspection, LocalObservation } from '../types'

export function PropertyDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [property, setProperty]             = useState<Property | null>(null)
  const [inspections, setInspections]       = useState<LocalInspection[]>([])
  const [starting, setStarting]             = useState(false)
  const [generatingId, setGeneratingId]     = useState<string | null>(null)
  const [reportResult, setReportResult]     = useState<Record<string, 'sent' | 'error'>>({})
  const [progress, setProgress]             = useState(0)
  const [progressStage, setProgressStage]   = useState('')
  const [error, setError]                   = useState('')
  const [checklist, setChecklist]           = useState<{ inspectionId: string; observations: LocalObservation[] } | null>(null)
  const progressIntervalRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  // Known pipeline stages: [ms from start, target %, label]
  // Timings are conservative — the bar waits at 95% until the API responds.
  const PROGRESS_STAGES: [number, number, string][] = [
    [0,     5,  'Fetching inspection data…'],
    [2000,  18, 'Processing observations…'],
    [12000, 55, 'Generating condition summary…'],
    [22000, 68, 'Downloading photos…'],
    [40000, 82, 'Building report document…'],
    [55000, 91, 'Uploading report…'],
    [65000, 95, 'Sending to your email…'],
  ]

  // Load property + inspections on mount
  useEffect(() => {
    if (!id) return
    supabase.from('properties').select('*').eq('id', id).single()
      .then(({ data }) => setProperty(data))
    getInspectionsForProperty(id)
      .then(async local => {
        setInspections(local)
        // Backfill report_sent for any synced inspection that hasn't had its
        // flag set locally (e.g. reports generated before this feature existed).
        const untagged = local.filter(i => i.synced && !i.report_sent)
        if (untagged.length === 0) return
        const { data: remote } = await supabase
          .from('inspections')
          .select('id, status')
          .in('id', untagged.map(i => i.id))
          .eq('status', 'report_generated')
        if (!remote || remote.length === 0) return
        await Promise.all(remote.map((r: { id: string }) => markReportSent(r.id)))
        // Reload so the updated report_sent flags are reflected in state
        getInspectionsForProperty(id).then(setInspections).catch(() => {})
      })
      .catch(() => {})
  }, [id])

  // Poll SQLite every 2 s while any completed inspection is still awaiting sync.
  // This ensures the "Generate Report" button appears as soon as the background
  // sync finishes uploading — without requiring the user to navigate away and back.
  useEffect(() => {
    if (!id) return
    const hasPending = inspections.some(i => i.status === 'completed' && !i.synced)
    if (!hasPending) return
    const timer = setInterval(() => {
      getInspectionsForProperty(id)
        .then(fresh => {
          setInspections(fresh)
        })
        .catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [id, inspections])

  // Opens the pre-report checklist before committing to generation
  const handleOpenChecklist = useCallback(async (inspectionId: string) => {
    const observations = await getObservationsForInspection(inspectionId)
    setChecklist({ inspectionId, observations })
  }, [])

  const handleGenerateReport = useCallback(async (inspectionId: string) => {
    setGeneratingId(inspectionId)
    setReportResult(prev => { const n = { ...prev }; delete n[inspectionId]; return n })

    // Start fake stage-based progress
    const startMs = Date.now()
    setProgress(0)
    setProgressStage(PROGRESS_STAGES[0][2])

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startMs
      let stageIdx = 0
      for (let i = 0; i < PROGRESS_STAGES.length; i++) {
        if (elapsed >= PROGRESS_STAGES[i][0]) stageIdx = i
      }
      const [stageStart, stagePct, stageLabel] = PROGRESS_STAGES[stageIdx]
      const next = PROGRESS_STAGES[stageIdx + 1]
      let pct = stagePct
      if (next) {
        const fraction = Math.min(1, (elapsed - stageStart) / (next[0] - stageStart))
        pct = stagePct + (next[1] - stagePct) * fraction
      }
      setProgress(Math.round(pct))
      setProgressStage(stageLabel)
    }, 400)

    try {
      await generateReport(inspectionId)
      // Snap to 100% with a success message
      if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
      setProgress(100)
      setProgressStage('Report sent to your email ✓')
      setReportResult(prev => ({ ...prev, [inspectionId]: 'sent' }))
      // Persist report_sent to SQLite so "Regenerate" label survives logout/re-login
      await markReportSent(inspectionId)
      setInspections(prev => prev.map(i => i.id === inspectionId ? { ...i, report_sent: true } : i))
    } catch (err: unknown) {
      console.error('[PROPERTY DETAIL] Report generation failed:', err instanceof Error ? err.message : err)
      if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
      setProgress(0)
      setProgressStage('')
      setReportResult(prev => ({ ...prev, [inspectionId]: 'error' }))
    } finally {
      setGeneratingId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDeleteInspection = async (id: string) => {
    if (!window.confirm('Delete this inspection and all its observations?')) return
    await deleteInspection(id)
    setInspections(prev => prev.filter(i => i.id !== id))
  }

  const handleStartInspection = async () => {
    if (!property || !profile) return
    setStarting(true)
    setError('')
    try {
      const inspection = await createInspection({
        property_id:      property.id,
        property_ref:     property.ref,
        property_name:    property.name,
        property_address: property.address,
        inspector_id:     profile.id,
      })
      navigate(`/inspection/${inspection.id}`, { state: { property } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start inspection')
      setStarting(false)
    }
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-ash-mid border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const flags = [
    property.has_car_park    && 'Car Park',
    property.has_lift        && 'Lift',
    property.has_roof_access && 'Roof Access',
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-ash-navy px-4 pt-12 pb-5">
        <button
          onClick={() => navigate('/properties')}
          className="flex items-center gap-2 mb-3 -ml-1 px-1 py-2 active:opacity-60"
        >
          <svg className="w-5 h-5 text-ash-light shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="text-ash-light text-base font-medium">Properties</span>
        </button>
        <span className="text-xs font-mono font-bold text-ash-light bg-ash-mid px-2 py-0.5 rounded">
          {property.ref}
        </span>
        <h1 className="text-white text-2xl font-bold mt-1 leading-tight">{property.name}</h1>
        <p className="text-ash-light text-sm mt-1">{property.address}</p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Property details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-2">
          <Row label="Management company" value={property.management_company} />
          <Row label="Units" value={String(property.number_of_units)} />
          <Row label="Type" value={property.block_type} />
          {flags.length > 0 && (
            <div className="flex gap-2 pt-1 flex-wrap">
              {flags.map(f => (
                <span key={f} className="text-xs bg-ash-light text-ash-navy px-2 py-0.5 rounded-full">{f}</span>
              ))}
            </div>
          )}
        </div>

        {/* Past inspections */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
            Inspection History
          </h2>
          {inspections.length === 0 ? (
            <p className="text-sm text-gray-400 px-1">No inspections recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {inspections.map(ins => {
                const isActive = ins.status !== 'completed'
                const startDate = new Date(ins.start_time)
                return (
                  <div
                    key={ins.id}
                    onClick={() => isActive ? navigate(`/inspection/${ins.id}`, { state: { property } }) : undefined}
                    className={`bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 ${isActive ? 'active:scale-[0.98] transition cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-ash-navy">
                          {startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">
                          {startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        ins.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {ins.status === 'completed' ? 'Complete' : 'In progress'}
                      </span>
                      {ins.status === 'completed' && ins.synced && (
                        <span className="text-xs shrink-0 text-green-500">✓</span>
                      )}
                      {ins.status === 'completed' && !ins.synced && (
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="w-3 h-3 border-2 border-ash-mid border-t-transparent rounded-full animate-spin inline-block" />
                          <span className="text-xs text-ash-mid">Uploading…</span>
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteInspection(ins.id) }}
                        className="w-11 h-11 flex items-center justify-center rounded-full text-gray-300 active:bg-red-50 active:text-red-500 shrink-0"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {isActive && (
                      <p className="text-xs text-ash-mid mt-1">Tap to resume →</p>
                    )}
                    {/* Generate report — only shown for synced completed inspections */}
                    {ins.status === 'completed' && ins.synced && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">

                        {/* Progress bar — visible while generating */}
                        {generatingId === ins.id && (
                          <div className="space-y-1">
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-ash-navy rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 text-center">{progressStage}</p>
                          </div>
                        )}

                        {/* Completion / error message */}
                        {generatingId !== ins.id && reportResult[ins.id] === 'error' && (
                          <p className="text-xs text-red-500 text-center">Report failed — please try again</p>
                        )}
                        {generatingId !== ins.id && (ins.report_sent || reportResult[ins.id] === 'sent') && (
                          <p className="text-xs text-green-600 text-center font-medium">Report sent to your email ✓</p>
                        )}

                        {/* Button — label persists across sessions via ins.report_sent */}
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (generatingId === ins.id) return
                            handleOpenChecklist(ins.id)
                          }}
                          disabled={generatingId !== null}
                          className="w-full py-2 rounded-lg bg-ash-navy text-white text-xs font-bold active:scale-[0.98] transition disabled:opacity-50"
                        >
                          {generatingId === ins.id
                            ? progress === 100 ? 'Done!' : 'Generating…'
                            : reportResult[ins.id] === 'error'
                              ? 'Retry'
                              : (ins.report_sent || reportResult[ins.id] === 'sent')
                                ? 'Regenerate Report'
                                : 'Generate Report'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      </div>

      {/* Start inspection CTA */}
      <div className="p-4 pb-8 bg-white border-t border-gray-100 shadow-md">
        <button
          onClick={handleStartInspection}
          disabled={starting}
          className="w-full py-4 rounded-xl bg-ash-navy text-white font-bold text-base active:scale-[0.98] transition disabled:opacity-60"
        >
          {starting ? 'Starting…' : '▶  Start Inspection'}
        </button>
      </div>

      {/* Pre-report checklist modal */}
      {checklist && property && (
        <PreReportChecklist
          property={property}
          inspectionId={checklist.inspectionId}
          observations={checklist.observations}
          onCancel={() => setChecklist(null)}
          onConfirm={() => {
            const { inspectionId } = checklist
            setChecklist(null)
            handleGenerateReport(inspectionId)
          }}
          onEditSection={sectionKey => {
            const { inspectionId } = checklist
            setChecklist(null)
            navigate(`/inspection/${inspectionId}`, { state: { property, jumpToSection: sectionKey } })
          }}
        />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="text-sm text-gray-700 text-right">{value}</span>
    </div>
  )
}
