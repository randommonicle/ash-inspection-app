import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { authHeaders } from '../services/apiClient'

interface RecentReport {
  id:          string
  type:        'bug' | 'suggestion'
  description: string
  status:      string
  created_at:  string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

type ReportType = 'bug' | 'suggestion'

interface Props {
  onClose: () => void
}

export function BugReportModal({ onClose }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [type, setType]               = useState<ReportType>('bug')
  const [description, setDescription] = useState('')
  const [loading, setLoading]         = useState(false)
  const [done, setDone]               = useState(false)
  const [error, setError]             = useState('')
  const [openReports, setOpenReports] = useState<RecentReport[]>([])

  // Fetch the user's recent unresolved reports so we can surface "you've
  // already reported something similar" hints before they submit a duplicate.
  useEffect(() => {
    if (!profile) return
    supabase
      .from('bug_reports')
      .select('id, type, description, status, created_at')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setOpenReports((data ?? []) as RecentReport[]))
  }, [profile])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !description.trim()) return
    setLoading(true)
    setError('')
    try {
      // Insert to Supabase
      const { error: dbErr } = await supabase.from('bug_reports').insert({
        reporter_id:   profile.id,
        reporter_name: profile.full_name,
        type,
        description:   description.trim(),
      })
      if (dbErr) throw new Error(dbErr.message)

      // Notify admin via server email (non-fatal if it fails)
      if (API_BASE) {
        await fetch(`${API_BASE}/api/bug-report`, {
          method:  'POST',
          headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type, description: description.trim(), reporterName: profile.full_name }),
        }).catch(() => {})
      }
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div
        className="mt-auto bg-white rounded-t-2xl p-5 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {done ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-3xl">✅</p>
            <p className="text-ash-navy font-bold text-lg">Thanks!</p>
            <p className="text-gray-500 text-sm">Your {type === 'bug' ? 'bug report' : 'suggestion'} has been submitted.</p>
            <button
              onClick={onClose}
              className="mt-4 w-full py-3 rounded-xl bg-ash-navy text-white font-bold text-sm active:scale-[0.98] transition"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ash-navy">Feedback</h2>
              <button
                type="button"
                onClick={() => { onClose(); navigate('/my-reports') }}
                className="text-xs text-ash-mid underline underline-offset-2 active:opacity-60"
              >
                My reports →
              </button>
            </div>

            {/* Existing open reports — soft dedup hint */}
            {openReports.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-900 font-semibold mb-1">
                  You have {openReports.length} open report{openReports.length === 1 ? '' : 's'}. Is this the same issue?
                </p>
                <ul className="space-y-1">
                  {openReports.map(r => (
                    <li key={r.id} className="text-xs text-amber-800 truncate">
                      • {r.description}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/my-reports') }}
                  className="text-xs text-amber-900 font-semibold underline underline-offset-2 mt-1.5 active:opacity-60"
                >
                  View open reports →
                </button>
              </div>
            )}

            {/* Type toggle */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {(['bug', 'suggestion'] as ReportType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition ${
                    type === t
                      ? 'bg-ash-navy text-white'
                      : 'bg-white text-gray-500 active:bg-gray-50'
                  }`}
                >
                  {t === 'bug' ? '🐛 Bug' : '💡 Suggestion'}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {type === 'bug' ? 'What went wrong?' : 'What would you like to see?'}
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                rows={5}
                placeholder={type === 'bug'
                  ? 'Describe what happened, what you expected, and any steps to reproduce…'
                  : 'Describe your idea or improvement…'
                }
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-ash-navy resize-none"
              />
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !description.trim()}
                className="flex-1 py-3 rounded-xl bg-ash-navy text-white font-bold text-sm active:scale-[0.98] transition disabled:opacity-40"
              >
                {loading ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
