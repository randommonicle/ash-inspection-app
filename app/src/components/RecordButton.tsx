import { useRef, useCallback, useState, type ReactNode } from 'react'

interface RecordButtonProps {
  onRecordingComplete: (blob: Blob) => void
  disabled?: boolean
  isTranscribing?: boolean
  /** When set, the button label shows "Tap to continue" instead of "Tap to record" */
  appendMode?: boolean
  /** Optional element rendered in the right slot (keeps the row balanced with the cancel button) */
  rightSlot?: ReactNode
}

const MAX_DURATION_MS = 60_000

export function RecordButton({ onRecordingComplete, disabled, isTranscribing, appendMode, rightSlot }: RecordButtonProps) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const streamRef   = useRef<MediaStream | null>(null)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isRec, setIsRec] = useState(false)

  const stopAndSubmit = useCallback(() => {
    if (!recorderRef.current) return
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    recorderRef.current.stop()   // onstop fires async — submission handled there
    setIsRec(false)
  }, [])

  const stopAndDiscard = useCallback(() => {
    if (!recorderRef.current) return
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    // Flag so onstop skips submission
    ;(recorderRef.current as MediaRecorder & { _cancelled?: boolean })._cancelled = true
    recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    setIsRec(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (disabled || isTranscribing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current   = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const cancelled = (recorder as MediaRecorder & { _cancelled?: boolean })._cancelled
        if (!cancelled) {
          const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
          if (blob.size > 0) onRecordingComplete(blob)
        }
        chunksRef.current = []
      }

      recorder.start(250)
      setIsRec(true)

      // Auto-stop after max duration
      timerRef.current = setTimeout(stopAndSubmit, MAX_DURATION_MS)
    } catch {
      alert('Microphone access is required. Please enable it in your device Settings.')
    }
  }, [disabled, isTranscribing, onRecordingComplete, stopAndSubmit])

  const handleTap = useCallback(() => {
    if (isRec) {
      stopAndSubmit()
    } else {
      startRecording()
    }
  }, [isRec, stopAndSubmit, startRecording])

  const idleLabel = appendMode ? 'Tap to continue' : 'Tap to record'

  return (
    <div className="flex flex-col items-center gap-1 select-none">

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

      <p className={`text-xs h-4 text-center ${
        isRec ? 'text-ash-red font-medium' : appendMode ? 'text-ash-mid font-medium' : 'text-gray-400'
      }`}>
        {isTranscribing ? 'Transcribing…' : isRec ? 'Tap to stop' : idleLabel}
      </p>

      {/* Button row — cancel appears to the right when recording */}
      <div className="flex items-center justify-center gap-5">

        {/* Spacer / cancel button */}
        <div className="w-14 h-14 flex items-center justify-center">
          {isRec && (
            <button
              onClick={stopAndDiscard}
              className="w-12 h-12 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center active:bg-red-50 active:border-red-300 transition"
            >
              <svg className="w-5 h-5 text-gray-400 active:text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Record / stop button */}
        <button
          onClick={handleTap}
          disabled={disabled || isTranscribing}
          className={`
            w-20 h-20 rounded-full border-4 flex items-center justify-center
            transition-all touch-none select-none
            ${isRec
              ? 'bg-ash-red border-red-300 scale-110 shadow-lg shadow-red-500/30'
              : 'bg-ash-navy border-ash-mid active:scale-95'
            }
            disabled:opacity-40
          `}
        >
          <div className={`transition-all ${
            isRec ? 'w-7 h-7 bg-white rounded-sm' : 'w-8 h-8 bg-ash-red rounded-full'
          }`} />
        </button>

        {/* Right slot — camera button or spacer, keeps layout balanced */}
        <div className="w-14 h-14 flex items-center justify-center">
          {rightSlot}
        </div>

      </div>

      <style>{`
        @keyframes wave {
          from { height: 4px; }
          to   { height: 28px; }
        }
      `}</style>
    </div>
  )
}
