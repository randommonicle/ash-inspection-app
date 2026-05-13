// Signature capture — full-screen pad where inspectors draw their signature
// the first time they sign in to a build that supports this.
//
// Output is a PNG with a transparent background, uploaded to Supabase Storage
// at `signatures/{user_id}.png`. The user row's `signature_path` column is
// updated so future logins skip this screen.
//
// Re-capture is allowed any time via the header "Signature" link — it just
// overwrites the existing PNG (upsert: true).
//
// Drawing uses Pointer Events so the same code path handles touch (phone),
// stylus (S-Pen), and mouse (Android Studio emulator) without branching.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onComplete: () => void
  // Allowed only on re-capture from the header. The first-time gate hides it.
  onCancel?:  () => void
}

const STORAGE_BUCKET = 'inspection-files'
// Internal canvas resolution. CSS sizes it to fit the screen; we draw at this
// resolution and let the export PNG carry the full detail to the report.
const CANVAS_WIDTH  = 900
const CANVAS_HEIGHT = 320

export function SignatureCapture({ onComplete, onCancel }: Props) {
  const { profile } = useAuth()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth   = 4
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.strokeStyle = '#1F3864'  // ASH navy
  }, [])

  const toCanvasCoords = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    return {
      x: ((ev.clientX - rect.left) / rect.width)  * canvas.width,
      y: ((ev.clientY - rect.top)  / rect.height) * canvas.height,
    }
  }

  const handlePointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    ev.preventDefault()
    canvasRef.current?.setPointerCapture(ev.pointerId)
    drawingRef.current = true
    lastPointRef.current = toCanvasCoords(ev)
  }

  const handlePointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    const point  = toCanvasCoords(ev)
    const last   = lastPointRef.current

    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }

    lastPointRef.current = point
    if (!hasInk) setHasInk(true)
  }

  const handlePointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    canvasRef.current?.releasePointerCapture(ev.pointerId)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const handleSave = async () => {
    if (!hasInk || !profile || saving) return
    setSaving(true)
    setError('')
    try {
      const canvas = canvasRef.current!
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('Failed to encode signature')),
          'image/png',
        )
      })

      const path = `signatures/${profile.id}.png`
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (uploadErr) throw new Error(uploadErr.message)

      const { error: dbErr } = await supabase
        .from('users')
        .update({ signature_path: path })
        .eq('id', profile.id)
      if (dbErr) throw new Error(dbErr.message)

      onComplete()
    } catch (err) {
      console.error('[SIGNATURE] Save failed:', err)
      setError(err instanceof Error ? err.message : 'Save failed — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="bg-ash-navy px-4 pt-12 pb-4 shadow-md">
        <h1 className="text-white text-xl font-bold">Sign here</h1>
        <p className="text-ash-light text-xs mt-1">
          Your signature will appear on every inspection report you generate.
          {onCancel ? '' : ' This is a one-off step — you won\'t be asked again.'}
        </p>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex flex-col items-stretch justify-center px-4 py-6 min-h-0">
        <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-auto block touch-none"
            style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          Draw your signature with your finger or a stylus
        </p>
        {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}
      </div>

      {/* Footer buttons */}
      <div className="border-t border-gray-100 px-4 py-4 pb-8 bg-white flex gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleClear}
          disabled={saving || !hasInk}
          className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50 transition disabled:opacity-30"
        >
          Clear
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasInk}
          className="flex-1 py-3 rounded-xl bg-ash-navy text-white font-bold text-sm active:scale-[0.98] transition disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save signature'}
        </button>
      </div>
    </div>
  )
}
