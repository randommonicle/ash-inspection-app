import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'

import { useAuth } from '../contexts/AuthContext'
import { useNetwork } from '../hooks/useNetwork'
import { RecordButton } from '../components/RecordButton'
import { ObservationFeedItem } from '../components/ObservationFeedItem'
import { SectionPicker } from '../components/SectionPicker'
import { transcribeAudio } from '../services/transcription'
import { classifyNarration } from '../services/classify'
import {
  getInspection, completeInspection,
  createObservation, getObservationsForInspection,
  updateObservationSection,
  createPhoto, getPhotosForInspection,
} from '../db/database'
import { syncPendingInspections } from '../services/sync'
import {
  SECTION_LABELS, SECTION_TEMPLATE_ORDER,
  type LocalInspection, type LocalObservation, type LocalPhoto, type Property, type SectionKey,
} from '../types'

interface PendingClassification {
  observationId: string
  narration: string
  suggestedSection: SectionKey
}

export function ActiveInspectionScreen() {
  const { inspectionId } = useParams<{ inspectionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const online = useNetwork()

  const property = location.state?.property as Property | undefined

  const [inspection, setInspection]     = useState<LocalInspection | null>(null)
  const [observations, setObservations] = useState<LocalObservation[]>([])
  const [photos, setPhotos]             = useState<LocalPhoto[]>([])
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [currentSection, setCurrentSection] = useState<SectionKey | null>(null)
  const [elapsed, setElapsed]           = useState(0)
  const [completing, setCompleting]     = useState(false)
  const [error, setError]               = useState('')

  // Low-confidence pending confirmation
  const [pending, setPending] = useState<PendingClassification | null>(null)

  // Manual override picker
  const [pickerFor, setPickerFor] = useState<string | null>(null) // observationId

  const feedRef      = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {})
    return () => { KeepAwake.allowSleep().catch(() => {}) }
  }, [])

  useEffect(() => {
    if (!inspectionId) return
    getInspection(inspectionId).then(ins => {
      if (ins) {
        setInspection(ins)
        startTimeRef.current = new Date(ins.start_time).getTime()
      }
    })
    getObservationsForInspection(inspectionId).then(setObservations)
    getPhotosForInspection(inspectionId).then(setPhotos)
  }, [inspectionId])

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [observations])

  const saveObservation = useCallback(async (
    narration: string,
    sectionKey: SectionKey,
    conf: 'auto' | 'manual',
  ) => {
    if (!inspectionId || !inspection) return
    const obs = await createObservation({
      inspection_id:       inspectionId,
      property_id:         inspection.property_id,
      section_key:         sectionKey,
      template_order:      SECTION_TEMPLATE_ORDER[sectionKey],
      raw_narration:       narration,
      classification_conf: conf,
    })
    setObservations(prev => [...prev, obs])
    setCurrentSection(sectionKey)
    return obs
  }, [inspectionId, inspection])

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    if (!inspectionId || !profile || !inspection) return
    setIsTranscribing(true)
    setError('')
    try {
      const transcript = await transcribeAudio(blob)
      if (!transcript) {
        setError('No speech detected — try again.')
        return
      }

      let result
      try {
        result = await classifyNarration(transcript)
      } catch (classifyErr) {
        const msg = classifyErr instanceof Error ? classifyErr.message : String(classifyErr)
        setError(`Classification failed: ${msg}`)
        await saveObservation(transcript, 'additional', 'auto')
        return
      }

      if (result.split_required && typeof result.split_at === 'number' && result.split_at > 0 && result.split_at < transcript.length) {
        // Two sections in one narration — split and save both
        const first  = transcript.slice(0, result.split_at).trim()
        const second = transcript.slice(result.split_at).trim()
        const firstResult  = await classifyNarration(first)
        const secondResult = await classifyNarration(second)
        if (first)  await saveObservation(first,  firstResult.section_key,  'auto')
        if (second) await saveObservation(second, secondResult.section_key, 'auto')
        return
      }

      if (result.confidence === 'low') {
        // Save with suggested section, but ask PM to confirm
        const obs = await saveObservation(transcript, result.section_key, 'auto')
        if (obs) {
          setPending({
            observationId:    obs.id,
            narration:        transcript,
            suggestedSection: result.section_key,
          })
        }
        return
      }

      // High or medium confidence — save directly
      await saveObservation(transcript, result.section_key, 'auto')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setIsTranscribing(false)
    }
  }, [inspectionId, profile, inspection, saveObservation])

  const confirmPending = useCallback(() => {
    setPending(null)
  }, [])

  const handleManualOverride = useCallback(async (observationId: string, newSection: SectionKey) => {
    await updateObservationSection(observationId, newSection, SECTION_TEMPLATE_ORDER[newSection])
    setObservations(prev => prev.map(o =>
      o.id === observationId
        ? { ...o, section_key: newSection, template_order: SECTION_TEMPLATE_ORDER[newSection], classification_conf: 'manual' }
        : o
    ))
    setPickerFor(null)
  }, [])

  const handleCamera = useCallback(async () => {
    if (!inspectionId) return
    try {
      const photo = await Camera.getPhoto({
        quality:       85,
        resultType:    CameraResultType.Uri,
        source:        CameraSource.Camera,
        saveToGallery: false,
      })

      const filename = `photo_${Date.now()}.jpg`
      let localPath  = photo.path ?? ''
      let webPath    = photo.webPath ?? ''

      if (photo.path) {
        const { data: base64 } = await Filesystem.readFile({ path: photo.path })
        await Filesystem.writeFile({
          path:      filename,
          data:      base64 as string,
          directory: Directory.Documents,
        })
        const uri = await Filesystem.getUri({ path: filename, directory: Directory.Documents })
        localPath  = uri.uri
        webPath    = Capacitor.convertFileSrc(localPath)
      }

      const savedPhoto = await createPhoto({
        inspection_id: inspectionId,
        local_path:    localPath,
        web_path:      webPath,
      })
      setPhotos(prev => [...prev, savedPhoto])
    } catch (err: unknown) {
      if (!(err instanceof Error && err.message.includes('cancelled'))) {
        setError('Camera error — please try again')
      }
    }
  }, [inspectionId])

  const handleComplete = useCallback(async () => {
    if (!inspectionId) return
    setCompleting(true)
    try {
      await completeInspection(inspectionId)
      navigate('/properties')
      syncPendingInspections().catch(() => {})
    } catch {
      setError('Failed to complete inspection')
      setCompleting(false)
    }
  }, [inspectionId, navigate])

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const pickerObservation = pickerFor ? observations.find(o => o.id === pickerFor) : null

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* Top bar */}
      <div className="bg-ash-navy px-4 pt-10 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-ash-light text-xs">{property?.ref ?? ''}</p>
            <h1 className="text-white font-bold text-base leading-tight truncate">
              {property?.name ?? inspection?.property_name ?? ''}
            </h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white font-mono text-lg font-bold">{formatTime(elapsed)}</p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-amber-400'}`} />
              <span className="text-ash-light text-xs">{online ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Current section indicator */}
        <div className="mt-2 bg-ash-mid/40 rounded-lg px-3 py-1.5">
          <p className="text-ash-light text-xs">
            {currentSection
              ? `Last section: ${SECTION_LABELS[currentSection]}`
              : observations.length === 0
                ? 'Ready — hold the button to record your first observation'
                : `${observations.length} observation${observations.length === 1 ? '' : 's'} recorded`
            }
          </p>
        </div>
      </div>

      {/* Low-confidence banner */}
      {pending && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex-shrink-0">
          <p className="text-amber-800 text-xs font-medium mb-2">
            Not sure — classified as <span className="font-bold">{SECTION_LABELS[pending.suggestedSection]}</span>. Correct?
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmPending}
              className="flex-1 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold active:opacity-80"
            >
              Yes, correct
            </button>
            <button
              onClick={() => { setPickerFor(pending.observationId); setPending(null) }}
              className="flex-1 py-1.5 rounded-lg border border-amber-400 text-amber-700 text-xs font-semibold active:opacity-80"
            >
              Change section
            </button>
          </div>
        </div>
      )}

      {/* Observation feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {observations.length === 0 && !isTranscribing && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16 space-y-2">
            <p className="text-4xl">🎙</p>
            <p className="text-sm">Hold the record button and narrate your observations.<br />Release when done.</p>
          </div>
        )}
        {observations.map(obs => (
          <ObservationFeedItem
            key={obs.id}
            observation={obs}
            photos={photos}
            onOverride={() => setPickerFor(obs.id)}
          />
        ))}
        {isTranscribing && (
          <div className="bg-white rounded-xl border border-ash-light shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-ash-mid border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm text-gray-500">Transcribing &amp; classifying…</span>
          </div>
        )}
        {error && (
          <p className="text-center text-red-500 text-sm px-4">{error}</p>
        )}

        {photos.filter(p => !p.observation_id).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xs text-gray-400 mb-2">Unlinked photos</p>
            <div className="flex gap-2 flex-wrap">
              {photos.filter(p => !p.observation_id).map(photo => (
                <img
                  key={photo.id}
                  src={photo.web_path ?? photo.local_path}
                  alt="Inspection photo"
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white border-t border-gray-100 shadow-md px-6 pt-4 pb-8 flex-shrink-0">
        <div className="flex items-end justify-center gap-8 mb-5">
          <button
            onClick={handleCamera}
            disabled={isTranscribing || completing}
            className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition disabled:opacity-40"
          >
            <CameraIcon />
          </button>
          <RecordButton
            onRecordingComplete={handleRecordingComplete}
            disabled={completing}
            isTranscribing={isTranscribing}
          />
          <div className="w-14 h-14" />
        </div>

        <button
          onClick={handleComplete}
          disabled={completing || isTranscribing || observations.length === 0}
          className="w-full py-3.5 rounded-xl border-2 border-ash-navy text-ash-navy font-bold text-sm active:scale-[0.98] transition disabled:opacity-40"
        >
          {completing ? 'Completing…' : '✓  Complete Inspection'}
        </button>
        {observations.length === 0 && (
          <p className="text-center text-gray-400 text-xs mt-2">Record at least one observation to complete</p>
        )}
      </div>

      {/* Section override picker */}
      {pickerFor && pickerObservation && (
        <SectionPicker
          current={pickerObservation.section_key}
          onSelect={key => handleManualOverride(pickerFor, key)}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg className="w-7 h-7 text-ash-navy" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    </svg>
  )
}
