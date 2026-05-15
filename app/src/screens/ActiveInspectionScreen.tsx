import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'

import { useAuth } from '../contexts/AuthContext'
import { useNetwork } from '../hooks/useNetwork'
import { useSync } from '../hooks/useSync'
import { RecordButton } from '../components/RecordButton'
import { ObservationFeedItem } from '../components/ObservationFeedItem'
import { SectionPicker } from '../components/SectionPicker'
import { PhotoViewer } from '../components/PhotoViewer'
import { transcribeAudio } from '../services/transcription'
import { classifyNarration } from '../services/classify'
import { retryPendingTranscriptions as retryPendingTranscriptionsService } from '../services/transcriptionRetry'
import {
  getInspection, completeInspection,
  createObservation, getObservationsForInspection,
  updateObservationSection, appendObservationNarration,
  createPhoto, getPhotosForInspection, deletePhoto,
  createPendingTranscription, getPendingTranscriptions, deletePendingTranscription,
} from '../db/database'
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
  const { status: syncStatus, triggerSync } = useSync()

  const property      = location.state?.property as Property | undefined
  const jumpToSection = location.state?.jumpToSection as SectionKey | undefined

  const [inspection, setInspection]     = useState<LocalInspection | null>(null)
  const [observations, setObservations] = useState<LocalObservation[]>([])
  const [photos, setPhotos]             = useState<LocalPhoto[]>([])
  // Each in-flight transcription gets a unique key pushed into this array.
  // The RecordButton and feed spinner both derive from its length — multiple
  // recordings can be transcribing simultaneously without blocking each other.
  const [processingItems, setProcessingItems] = useState<string[]>([])
  const isTranscribing = processingItems.length > 0   // convenience alias for visual indicators

  const [currentSection, setCurrentSection] = useState<SectionKey | null>(jumpToSection ?? null)
  const [elapsed, setElapsed]           = useState(0)
  const [completing, setCompleting]     = useState(false)
  const [error, setError]               = useState('')

  // Low-confidence pending confirmation
  const [pending, setPending] = useState<PendingClassification | null>(null)

  // Manual override picker
  const [pickerFor, setPickerFor] = useState<string | null>(null) // observationId

  // "Add more" — when set, the next recording appends to this observation
  const [appendingToId, setAppendingToId] = useState<string | null>(null)

  // Tap-to-fullscreen viewer for the "Unlinked photos" strip. Observation-
  // linked photos use their own viewer state inside ObservationFeedItem.
  const [unlinkedFullscreen, setUnlinkedFullscreen] = useState<LocalPhoto | null>(null)

  // Offline audio queue
  const [pendingCount, setPendingCount]   = useState(0)
  const [retrying, setRetrying]           = useState(false)
  const prevOnlineRef                     = useRef(true)

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
    getPendingTranscriptions(inspectionId).then(pts => setPendingCount(pts.length))
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

  const retryPendingTranscriptions = useCallback(async () => {
    if (!inspectionId || !inspection) return
    setRetrying(true)
    setError('')
    const { remaining, processed } = await retryPendingTranscriptionsService(inspectionId, inspection.property_id)
    if (processed > 0) {
      // Pull fresh observations into local state so the feed shows the newly-
      // transcribed entries. The retry service writes them directly to SQLite.
      const fresh = await getObservationsForInspection(inspectionId)
      setObservations(fresh)
      // Kick off a sync pass — the retry service has already marked the
      // inspection unsynced if any observations were created.
      triggerSync().catch(() => {})
    }
    setPendingCount(remaining)
    setRetrying(false)
  }, [inspectionId, inspection, triggerSync])

  // Auto-retry queued recordings whenever we have a network connection.
  // Fires on initial mount when online (the original bug only fired on the
  // false→true edge, so a queue that survived a fresh app launch never ran).
  // The session ref re-arms on each offline period so we don't spam retries
  // while staying continuously online.
  const retrySessionRef = useRef(false)
  useEffect(() => {
    if (!online) {
      retrySessionRef.current = false
      prevOnlineRef.current = online
      return
    }
    if (!inspection || retrySessionRef.current) {
      prevOnlineRef.current = online
      return
    }
    retrySessionRef.current = true
    retryPendingTranscriptions()
    prevOnlineRef.current = online
  }, [online, inspection, retryPendingTranscriptions])

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    if (!inspectionId || !profile || !inspection) return

    // Each recording gets its own unique key so multiple transcriptions can run
    // simultaneously without blocking each other or the RecordButton.
    const itemKey = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setProcessingItems(prev => [...prev, itemKey])
    setError('')

    // Capture and clear append mode before any async work
    const targetId = appendingToId
    setAppendingToId(null)

    // Write the audio to disk AND register a pending_transcription row before
    // we attempt transcription. This ordering is load-bearing: if the app is
    // killed mid-upload (process death on slow 4G, Android low-memory kill),
    // the audio file would otherwise outlive its bookkeeping and the retry
    // mechanism would never see it. By creating the row first, every audio
    // file on disk is guaranteed to have a row pointing at it.
    //
    // On successful transcription we tear the row + file down in the finally
    // block. On failure we leave them in place for the next retry pass.
    let savedAudioPath: string | null = null
    let pendingId: string | null = null
    let transcriptionSucceeded = false
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const filename = `audio_${Date.now()}.webm`
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents })
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Documents })
      savedAudioPath = uri
      const row = await createPendingTranscription({ inspection_id: inspectionId, audio_path: savedAudioPath })
      pendingId = row.id
      // The pending count is only incremented in the catch block below — we
      // don't want the "queued" banner to flash during the normal in-flight
      // window of a successful recording.
    } catch {
      // If the file was written but the row insert failed (SQLite under
      // stress), clear up the orphan file so we don't leave a stranded blob
      // with no bookkeeping pointing at it. Then proceed without offline
      // retry capability for this recording.
      if (savedAudioPath) {
        await Filesystem.deleteFile({ path: savedAudioPath }).catch(() => {})
        savedAudioPath = null
      }
    }

    try {
      const transcript = await transcribeAudio(blob)
      // Network call returned without throwing — the audio file has served its
      // purpose, regardless of whether downstream classification/save succeeds.
      transcriptionSucceeded = true
      if (!transcript) {
        setError('No speech detected — try again.')
        return
      }

      // ── Append mode: extend an existing observation ──────────────────────
      if (targetId) {
        let result
        try {
          result = await classifyNarration(transcript)
        } catch {
          result = { section_key: 'additional' as const, confidence: 'low' as const, split_required: false }
        }
        await appendObservationNarration(
          targetId, transcript, result.section_key, SECTION_TEMPLATE_ORDER[result.section_key]
        )
        setObservations(prev => prev.map(o =>
          o.id === targetId
            ? { ...o, raw_narration: `${o.raw_narration} ${transcript}`, section_key: result.section_key, template_order: SECTION_TEMPLATE_ORDER[result.section_key] }
            : o
        ))
        return
      }

      // ── Normal mode: create a new observation ────────────────────────────
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
        const first  = transcript.slice(0, result.split_at).trim()
        const second = transcript.slice(result.split_at).trim()
        const firstResult  = await classifyNarration(first)
        const secondResult = await classifyNarration(second)
        if (first)  await saveObservation(first,  firstResult.section_key,  'auto')
        if (second) await saveObservation(second, secondResult.section_key, 'auto')
        return
      }

      if (result.confidence === 'low') {
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

      await saveObservation(transcript, result.section_key, 'auto')
    } catch (err: unknown) {
      if (!transcriptionSucceeded && pendingId) {
        // Network failed before transcription returned. The row + file are
        // intact — surface the queued state so the PM knows the audio is
        // safe and the retry mechanism will pick it up.
        setPendingCount(prev => prev + 1)
        setError('No connection — audio saved. Will transcribe when back online.')
      } else {
        // Either transcription succeeded but classify/save downstream failed
        // (the audio is no longer useful), or we never managed to write the
        // file at all. Either way, the row + file cleanup in finally handles
        // it correctly; just show a generic error.
        setError(err instanceof Error ? err.message : 'Recording failed')
      }
    } finally {
      // Remove this recording's placeholder from the processing queue.
      setProcessingItems(prev => prev.filter(k => k !== itemKey))
      // Transcription succeeded → drop the pending row + audio file so the
      // retry mechanism doesn't reprocess them. On failure we leave both for
      // the next retry pass. pendingCount stays untouched here — it's only
      // mutated on the failure path where the row is actually kept.
      if (transcriptionSucceeded && pendingId) {
        await deletePendingTranscription(pendingId).catch(() => {})
      }
      if (transcriptionSucceeded && savedAudioPath) {
        await Filesystem.deleteFile({ path: savedAudioPath }).catch(() => {})
      }
    }
  }, [inspectionId, profile, inspection, saveObservation, appendingToId])

  const confirmPending = useCallback(() => {
    setPending(null)
    setAppendingToId(null)
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
    // Capture lastObs once so every photo in a burst links to the same
    // observation, even if a transcription completes mid-burst.
    const lastObs = observations[observations.length - 1]

    while (true) {
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
          inspection_id:  inspectionId,
          observation_id: lastObs?.id,
          local_path:     localPath,
          web_path:       webPath,
        })
        setPhotos(prev => [...prev, savedPhoto])
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('cancelled')) {
          // User exited the camera — end the burst.
          break
        }
        setError('Camera error — please try again')
        break
      }
    }
  }, [inspectionId, observations])

  const handleDeletePhoto = useCallback(async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId)
    await deletePhoto(photoId)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
    if (photo?.local_path) {
      await Filesystem.deleteFile({ path: photo.local_path }).catch(() => {})
    }
  }, [photos])

  const handleComplete = useCallback(async () => {
    if (!inspectionId) return
    if (pendingCount > 0) {
      // Block completion while audio is still queued — otherwise the inspection
      // is marked complete with missing observations and the report goes out
      // without them. The retry banner already tells the PM what's queued.
      setError(`${pendingCount} audio recording${pendingCount === 1 ? ' is' : 's are'} still waiting to transcribe. Connect to network and wait for them to clear before completing.`)
      return
    }
    setCompleting(true)
    try {
      await completeInspection(inspectionId)
      // Navigate to the property detail screen so the user can see the
      // upload progress and, once synced, trigger the report from there.
      const propId = property?.id ?? inspection?.property_id
      if (propId) {
        navigate(`/properties/${propId}`, { state: { property } })
      } else {
        navigate('/properties')
      }
      triggerSync().catch(() => {})
    } catch {
      setError('Failed to complete inspection')
      setCompleting(false)
    }
  }, [inspectionId, navigate, triggerSync, property, inspection, pendingCount])

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
              <div className={`w-2 h-2 rounded-full ${
                !online              ? 'bg-amber-400' :
                syncStatus === 'syncing' ? 'bg-blue-400 animate-pulse' :
                syncStatus === 'error'   ? 'bg-red-400' :
                'bg-green-400'
              }`} />
              <span className="text-ash-light text-xs">
                {!online              ? 'Offline'  :
                 syncStatus === 'syncing' ? 'Syncing…' :
                 syncStatus === 'queued'  ? 'Queued'   :
                 syncStatus === 'error'   ? 'Sync error' :
                 'Online'}
              </span>
            </div>
          </div>
        </div>

        {/* Current section indicator */}
        <div className={`mt-2 rounded-lg px-3 py-1.5 ${
          jumpToSection && currentSection === jumpToSection
            ? 'bg-amber-400/30'
            : 'bg-ash-mid/40'
        }`}>
          <p className="text-ash-light text-xs">
            {jumpToSection && currentSection === jumpToSection
              ? `⚠ Add observation for: ${SECTION_LABELS[jumpToSection]}`
              : currentSection
                ? `Last section: ${SECTION_LABELS[currentSection]}`
                : observations.length === 0
                  ? 'Ready — tap the button below to record your first observation'
                  : `${observations.length} observation${observations.length === 1 ? '' : 's'} recorded`
            }
          </p>
        </div>
      </div>

      {/* Low-confidence banner — refers to the amber-highlighted card in the feed below */}
      {pending && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex-shrink-0">
          <p className="text-amber-800 text-sm font-medium">
            Not sure about the last observation ↓
          </p>
          <p className="text-amber-700 text-xs mb-2">
            Classified as <span className="font-bold">{SECTION_LABELS[pending.suggestedSection]}</span> — is that correct?
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmPending}
              className="flex-1 py-3 rounded-lg bg-amber-600 text-white text-sm font-semibold active:opacity-80"
            >
              Yes, correct
            </button>
            <button
              onClick={() => { setPickerFor(pending.observationId); setPending(null) }}
              className="flex-1 py-3 rounded-lg border border-amber-400 text-amber-700 text-sm font-semibold active:opacity-80"
            >
              Change section
            </button>
          </div>
        </div>
      )}

      {/* Queued recordings banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0 flex items-center gap-2">
          {retrying
            ? <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
            : <span className="text-amber-500 text-sm shrink-0">⏳</span>
          }
          <p className="text-amber-700 text-xs">
            {retrying
              ? `Retrying ${pendingCount} queued recording${pendingCount !== 1 ? 's' : ''}…`
              : `${pendingCount} recording${pendingCount !== 1 ? 's' : ''} queued — will transcribe when back online`
            }
          </p>
        </div>
      )}

      {/* Observation feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {observations.length === 0 && photos.length === 0 && processingItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16 space-y-2">
            <p className="text-4xl">🎙</p>
            <p className="text-sm">Tap the record button to narrate, or use the camera to take photos.<br />You can do both, or either.</p>
          </div>
        )}
        {observations.map((obs, idx) => (
          <ObservationFeedItem
            key={obs.id}
            observation={obs}
            photos={photos}
            onOverride={() => { setAppendingToId(null); setPickerFor(obs.id) }}
            onAppend={idx === observations.length - 1
              ? () => setAppendingToId(prev => prev === obs.id ? null : obs.id)
              : undefined
            }
            isAppendTarget={appendingToId === obs.id}
            isPendingConfirmation={pending?.observationId === obs.id}
            onDeletePhoto={handleDeletePhoto}
          />
        ))}
        {/* One placeholder card per in-flight transcription — PM can record again immediately */}
        {processingItems.map(key => (
          <div key={key} className="bg-white rounded-xl border border-ash-light shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-ash-mid border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm text-gray-500">Transcribing &amp; classifying…</span>
          </div>
        ))}
        {error && (
          <p className="text-center text-red-500 text-sm px-4">{error}</p>
        )}

        {photos.filter(p => !p.observation_id).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xs text-gray-400 mb-2">Unlinked photos</p>
            <div className="flex gap-2 flex-wrap">
              {photos.filter(p => !p.observation_id).map(photo => (
                <div key={photo.id} className="relative shrink-0">
                  <button
                    onClick={() => setUnlinkedFullscreen(photo)}
                    className="active:opacity-80 transition"
                  >
                    <img
                      src={photo.web_path ?? photo.local_path}
                      alt="Inspection photo"
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                  </button>
                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center active:bg-red-600 transition shadow-sm"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white border-t border-gray-100 shadow-md px-6 pt-4 pb-8 flex-shrink-0">
        <div className="flex items-end justify-center mb-5">
          <RecordButton
            onRecordingComplete={handleRecordingComplete}
            disabled={completing}
            isTranscribing={isTranscribing}
            appendMode={appendingToId !== null}
            rightSlot={
              <button
                onClick={handleCamera}
                disabled={completing}
                className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition disabled:opacity-40"
              >
                <CameraIcon />
              </button>
            }
          />
        </div>

        <button
          onClick={handleComplete}
          disabled={completing || processingItems.length > 0 || pendingCount > 0 || (observations.length === 0 && photos.length === 0)}
          className="w-full py-4 rounded-xl border-2 border-ash-navy text-ash-navy font-bold text-base active:scale-[0.98] transition disabled:opacity-40"
        >
          {completing ? 'Completing…' : '✓  Complete Inspection'}
        </button>
        {observations.length === 0 && photos.length === 0 && (
          <p className="text-center text-gray-400 text-xs mt-2">Record an observation or take a photo to complete</p>
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

      {/* Fullscreen viewer for unlinked photos */}
      {unlinkedFullscreen && (
        <PhotoViewer
          photo={unlinkedFullscreen}
          onClose={() => setUnlinkedFullscreen(null)}
          onDelete={handleDeletePhoto}
        />
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg className="w-9 h-9 text-ash-navy" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    </svg>
  )
}
