import { useRef, useCallback } from 'react'

interface RecordButtonProps {
  onRecordingComplete: (blob: Blob) => void
  disabled?: boolean
  isTranscribing?: boolean
}

const MAX_DURATION_MS = 30_000

export function RecordButton({ onRecordingComplete, disabled, isTranscribing }: RecordButtonProps) {
  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const streamRef    = useRef<MediaStream | null>(null)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRecRef     = useRef(false)

  const stop = useCallback(() => {
    if (!isRecRef.current) return
    isRecRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    recorderRef.current?.stop()
  }, [])

  const start = useCallback(async () => {
    if (isRecRef.current || disabled) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick best supported MIME type
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current   = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size > 0) onRecordingComplete(blob)
      }

      recorder.start(250) // collect data every 250ms
      isRecRef.current = true

      // Auto-stop at 30 seconds
      timerRef.current = setTimeout(stop, MAX_DURATION_MS)
    } catch {
      // Permission denied or unavailable
      alert('Microphone access is required. Please enable it in your device Settings.')
    }
  }, [disabled, onRecordingComplete, stop])

  const isRec = isRecRef.current

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Waveform */}
      <div className="flex items-end gap-[3px] h-8">
        {[4, 7, 12, 18, 14, 9, 16, 11, 6, 13, 8, 15, 10].map((h, i) => (
          <div
            key={i}
            className={`w-[3px] rounded-full transition-all ${
              isRec ? 'bg-ash-red' : isTranscribing ? 'bg-ash-amber' : 'bg-ash-mid/40'
            }`}
            style={{
              height: isRec ? undefined : `${h * 0.5}px`,
              minHeight: 3,
              animation: isRec ? `wave ${0.4 + i * 0.07}s ease-in-out infinite alternate` : undefined,
            }}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 h-4">
        {isTranscribing ? 'Transcribing…' : isRec ? 'Release to stop (max 30s)' : 'Hold to record'}
      </p>

      {/* Record button */}
      <button
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        disabled={disabled || isTranscribing}
        className={`
          w-20 h-20 rounded-full border-4 flex items-center justify-center
          transition-all select-none touch-none
          ${isRec
            ? 'bg-ash-red border-red-300 scale-110 shadow-lg shadow-red-500/30'
            : 'bg-ash-navy border-ash-mid active:scale-95'
          }
          disabled:opacity-40
        `}
      >
        <div className={`rounded-full transition-all ${
          isRec ? 'w-7 h-7 bg-white rounded-sm' : 'w-8 h-8 bg-ash-red rounded-full'
        }`} />
      </button>

      <style>{`
        @keyframes wave {
          from { height: 4px; }
          to   { height: 28px; }
        }
      `}</style>
    </div>
  )
}
