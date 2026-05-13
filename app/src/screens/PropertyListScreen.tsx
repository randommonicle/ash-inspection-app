import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BugReportModal } from '../components/BugReportModal'
import { SignatureCapture } from '../components/SignatureCapture'
import type { Property } from '../types'

export function PropertyListScreen() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [properties, setProperties]     = useState<Property[]>([])
  const [showBugReport, setShowBugReport] = useState(false)
  const [showSignature, setShowSignature] = useState(false)
  const [query, setQuery]           = useState('')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!profile) return
    fetchProperties()
  }, [profile])

  const fetchProperties = async () => {
    setLoading(true)
    setError('')
    try {
      // RLS handles row filtering, but we also apply client-side sort
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('ref', { ascending: true })

      if (error) throw error
      setProperties(data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load properties.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return properties
    const q = query.toLowerCase()
    return properties.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.ref.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q)
    )
  }, [properties, query])

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-ash-navy px-4 pt-12 pb-4 shadow-md flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">Properties</h1>
            <p className="text-ash-light text-xs mt-0.5">
              {loading ? 'Loading…' : `${properties.length} in your portfolio`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-white text-sm font-medium">{profile?.full_name ?? ''}</p>
            <div className="flex gap-3 mt-0.5 justify-end">
              <button
                onClick={() => setShowSignature(true)}
                className="text-ash-light text-xs underline underline-offset-2 active:opacity-60"
              >
                Signature
              </button>
              <button
                onClick={() => setShowBugReport(true)}
                className="text-ash-light text-xs underline underline-offset-2 active:opacity-60"
              >
                Feedback
              </button>
              <button
                onClick={signOut}
                className="text-ash-light text-xs underline underline-offset-2 active:opacity-60"
              >
                Sign out
              </button>
            </div>
            <p className="text-ash-light/60 text-[10px] mt-1 font-mono">v{__APP_VERSION__}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or ref…"
            className="
              w-full pl-9 pr-3 py-2.5 rounded-lg
              bg-white/10 border border-ash-mid
              text-white placeholder-white/40 text-sm
              focus:outline-none focus:border-ash-light
            "
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-red-600 text-sm text-center">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-8 text-gray-400 text-sm text-center">
            {query ? 'No properties match your search.' : 'No properties found.'}
          </div>
        )}
        <div className="p-3 space-y-2.5">
          {filtered.map(property => (
            <PropertyCard key={property.id} property={property} onPress={() => navigate(`/properties/${property.id}`, { state: { property } })} />
          ))}
        </div>
      </div>

      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
      {showSignature && (
        <SignatureCapture
          onComplete={() => setShowSignature(false)}
          onCancel={() => setShowSignature(false)}
        />
      )}
    </div>
  )
}

function PropertyCard({ property, onPress }: { property: Property; onPress: () => void }) {
  const flags = [
    property.has_car_park    && 'Car Park',
    property.has_lift        && 'Lift',
    property.has_roof_access && 'Roof Access',
  ].filter(Boolean) as string[]

  return (
    <div onClick={onPress} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3.5 active:bg-gray-50 cursor-pointer">
      <div className="flex items-start gap-3">

        {/* Ref badge */}
        <div className="flex-shrink-0 mt-0.5">
          <span className="
            inline-block font-mono text-xs font-bold
            text-ash-mid bg-ash-light
            px-2 py-0.5 rounded
          ">
            {property.ref}
          </span>
        </div>

        {/* Name + address */}
        <div className="flex-1 min-w-0">
          <p className="text-ash-navy font-semibold text-[15px] leading-snug">{property.name}</p>
          <p className="text-gray-500 text-sm mt-0.5 leading-snug truncate">{property.address}</p>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {flags.map(f => (
                <span key={f} className="text-[11px] bg-ash-light text-ash-navy px-2 py-0.5 rounded-full">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Unit count */}
        <div className="flex-shrink-0 text-right">
          <span className="text-ash-navy font-bold text-lg leading-none">
            {property.number_of_units}
          </span>
          <p className="text-gray-400 text-[11px] mt-0.5">units</p>
        </div>
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none"
      fill="none" stroke="currentColor" strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <circle cx={11} cy={11} r={8} />
      <path d="m21 21-4.35-4.35" strokeLinecap="round" />
    </svg>
  )
}
