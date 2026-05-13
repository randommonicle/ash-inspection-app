import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'

type BugStatus = 'open' | 'in_progress' | 'fixed' | 'wont_fix' | 'duplicate'

interface BugReport {
  id:               string
  type:             'bug' | 'suggestion'
  description:      string
  status:           BugStatus
  resolution_notes: string | null
  resolved_version: string | null
  duplicate_of:     string | null
  created_at:       string
  updated_at:       string
}

const STATUS_LABEL: Record<BugStatus, string> = {
  open:        'Open',
  in_progress: 'In progress',
  fixed:       'Fixed',
  wont_fix:    "Won't fix",
  duplicate:   'Duplicate',
}

const STATUS_CLASSES: Record<BugStatus, string> = {
  open:        'bg-red-50 text-red-700 border border-red-200',
  in_progress: 'bg-amber-50 text-amber-700 border border-amber-200',
  fixed:       'bg-green-50 text-green-700 border border-green-200',
  wont_fix:    'bg-gray-100 text-gray-600 border border-gray-200',
  duplicate:   'bg-purple-50 text-purple-700 border border-purple-200',
}

export function MyReportsScreen() {
  const { profile } = useAuth()
  const navigate                = useNavigate()
  const [reports, setReports]   = useState<BugReport[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    const fetchReports = async () => {
      setError('')
      // RLS scopes this to the current user via bug_reports_select_own.
      const { data, error: err } = await supabase
        .from('bug_reports')
        .select('id, type, description, status, resolution_notes, resolved_version, duplicate_of, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (err) {
        setError(err.message)
      } else {
        setReports((data ?? []) as BugReport[])
      }
      setLoading(false)
    }

    fetchReports()
    // Light auto-refresh — picks up admin status changes within ~30 s
    const t = setInterval(fetchReports, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [profile])

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-ash-navy px-4 pt-12 pb-4 shadow-md flex-shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-ash-light text-sm active:opacity-60"
          >
            ← Back
          </button>
          <h1 className="text-white text-base font-bold">My Reports</h1>
          <div className="w-12" />
        </div>
        <p className="text-ash-light text-xs text-center mt-1">
          {loading ? 'Loading…' : `${reports.length} report${reports.length === 1 ? '' : 's'} submitted`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-red-600 text-sm text-center">{error}</div>
        )}
        {!loading && !error && reports.length === 0 && (
          <div className="p-10 text-gray-400 text-sm text-center">
            You haven't submitted any reports yet.
          </div>
        )}
        <div className="p-3 space-y-3">
          {reports.map(r => <ReportCard key={r.id} report={r} />)}
        </div>
      </div>
    </div>
  )
}

function ReportCard({ report }: { report: BugReport }) {
  const typeBadge = report.type === 'bug'
    ? <span className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-200">Bug</span>
    : <span className="bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200">Suggestion</span>

  const statusBadge = (
    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASSES[report.status]}`}>
      {STATUS_LABEL[report.status]}
    </span>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        {typeBadge}
        {statusBadge}
        <span className="text-gray-400 text-xs ml-auto">{formatDate(report.created_at)}</span>
      </div>

      <p className="text-gray-800 text-sm whitespace-pre-wrap">{report.description}</p>

      {report.status === 'fixed' && report.resolution_notes && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-baseline gap-2">
            <span className="text-green-600 text-xs font-semibold uppercase tracking-wide">Fixed</span>
            {report.resolved_version && (
              <span className="text-gray-500 text-xs">in v{report.resolved_version}</span>
            )}
          </div>
          <p className="text-gray-700 text-sm mt-1 italic">{report.resolution_notes}</p>
        </div>
      )}

      {report.status === 'wont_fix' && report.resolution_notes && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Closed</span>
          <p className="text-gray-700 text-sm mt-1 italic">{report.resolution_notes}</p>
        </div>
      )}

      {report.status === 'duplicate' && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-purple-600 text-xs font-semibold uppercase tracking-wide">
            Merged with another report
          </span>
          {report.resolution_notes && (
            <p className="text-gray-700 text-sm mt-1 italic">{report.resolution_notes}</p>
          )}
        </div>
      )}

      {report.status === 'in_progress' && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-amber-600 text-xs font-semibold uppercase tracking-wide">
            Being looked at
          </span>
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
