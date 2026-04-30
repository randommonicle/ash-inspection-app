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
import { transcribeAudio } from '../services/transcription'
import {
  getInspection, completeInspection,
  createObservation, getObservationsForInspection,
  createPhoto, getPhotosForInspection,
} from '../db/database'
import { syncPendingInspections } from '../services/sync'
import type { LocalInspection, LocalObservation, LocalPhoto, Property } from '../types'

export function ActiveInspectionScreen() {
  const { inspectionId } = useParams<{ inspectionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const online = useNetwork()

  const property = location.state?.property as Property | undefined

  const [inspection, setInspection]   = useState<LocalInspection | null>(null)
  const [observations, setObservations] = useState<LocalObservation[]>([])
  const [photos, setPhotos]           = useState<LocalPhoto[]>([])
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [elapsed, setElapsed]         = useState(0)
  const [completing, setCompleting]   = useState(false)
  const [error, setError]             = useState('')

  const feedRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(Date.now())

  // Keep screen awake
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {})
    return () => { KeepAwake.allowSleep().catch(() => {}) }
  }, [])

  // Load inspection
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

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Scroll feed to bottom on new observation
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [observations])

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    if (!inspectionId || !profile) return
    setIsTranscribing(true)
    setError('')
    try {
      const transcript = await transcribeAudio(blob)
      if (!transcript) {
        setError('No speech detected — try again.')
        return
      }
      const obs = await createObservation({
        inspection_id:      inspectionId,
        property_id:        inspection?.property_id ?? '',
        section_key:        'additional', // Phase 3 will classify this
        template_order:     12,
        raw_narration:      transcript,
        classification_conf: 'auto',
      })
      setObservations(prev => [...prev, obs])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setIsTranscribing(false)
    }
  }, [inspectionId, profile, inspection])

  const handleCamera = useCallback(async () => {
    if (!inspectionId) return
    try {
      const photo = await Camera.getPhoto({
        quality:    85,
        resultType: CameraResultType.Uri,
        source:     CameraSource.Camera,
        saveToGallery: false,
      })

      // Save to app filesystem for persistence
      const filename = `photo_${Date.now()}.jpg`
      let localPath  = photo.path ?? ''
      let webPath    = photo.webPath ?? ''

      if (photo.path) {
        // Read via Filesystem plugin — avoids binary corruption from text-mode XHR
        const { data: base64 } = await Filesystem.readFile({ path: photo.path })

        await Filesystem.writeFile({
          path:      filename,
          data:      base64 as string,
          directory: Directory.Documents,
        })

        const uri  = await Filesystem.getUri({ path: filename, directory: Directory.Documents })
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
      // User cancelled camera — ignore
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
      // Fire-and-forget sync — runs after navigation, errors are swallowed
      syncPendingInspections().catch(() => {})
    } catch {
      setError('Failed to complete inspection')
      setCompleting(false)
    }
  }, [inspectionId, navigate])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

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

        {/* Current section note */}
        <div className="mt-2 bg-ash-mid/40 rounded-lg px-3 py-1.5">
          <p className="text-ash-light text-xs">
            {observations.length === 0
              ? 'Ready — hold the button to record your first observation'
              : `${observations.length} observation${observations.length === 1 ? '' : 's'} recorded`
            }
          </p>
        </div>
      </div>

      {/* Observation feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {observations.length === 0 && !isTranscribing && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16 space-y-2">
            <p className="text-4xl">🎙</p>
            <p className="text-sm">Hold the record button and narrate your observations.<br />Release when done.</p>
          </div>
        )}
        {observations.map(obs => (
          <ObservationFeedItem key={obs.id} observation={obs} photos={photos} />
        ))}
        {isTranscribing && (
          <div className="bg-white rounded-xl border border-ash-light shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-ash-mid border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm text-gray-500">Transcribing…</span>
          </div>
        )}
        {error && (
          <p className="text-center text-red-500 text-sm px-4">{error}</p>
        )}

        {/* Photos not linked to observations */}
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

          {/* Camera button */}
          <button
            onClick={handleCamera}
            disabled={isTranscribing || completing}
            className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition disabled:opacity-40"
          >
            <CameraIcon />
          </button>

          {/* Record button */}
          <RecordButton
            onRecordingComplete={handleRecordingComplete}
            disabled={completing}
            isTranscribing={isTranscribing}
          />

          {/* Placeholder to balance layout */}
          <div className="w-14 h-14" />
        </div>

        {/* Complete button */}
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
