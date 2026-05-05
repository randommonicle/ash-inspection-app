import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../contexts/AuthContext'

interface RosterEntry {
  full_name: string
}

type Step = 'pick' | 'credentials' | 'verify-email'

export function RegisterScreen() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [roster, setRoster]         = useState<RosterEntry[]>([])
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [step, setStep]             = useState<Step>('pick')
  const [selected, setSelected]     = useState<RosterEntry | null>(null)
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    supabase.from('pm_roster').select('full_name').order('full_name').then(({ data }) => {
      setRoster(data ?? [])
      setLoadingRoster(false)
    })
  }, [])

  const handlePickName = async (entry: RosterEntry) => {
    setError('')
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('full_name', entry.full_name)

    if (count && count > 0) {
      setError(`An account already exists for ${entry.full_name}. Contact your administrator.`)
      return
    }
    setSelected(entry)
    setStep('credentials')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await signUp(email.trim(), password, selected.full_name)
      setStep('verify-email')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen bg-ash-navy px-6 select-none">
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
            <span className="text-4xl font-bold tracking-[0.25em] text-white">ASH</span>
            <span className="text-ash-light text-xs tracking-widest uppercase mt-1">Chartered Surveyors</span>
          </div>
          <div className="mt-5 h-px bg-ash-mid" />
          <p className="text-ash-light text-xs tracking-widest uppercase mt-3">Create Account</p>
        </div>

        {/* Step: pick name */}
        {step === 'pick' && (
          <div>
            <p className="text-ash-light text-sm text-center mb-4">Who are you?</p>
            {loadingRoster ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-ash-light border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2.5">
                {roster.map(entry => (
                  <button
                    key={entry.full_name}
                    onClick={() => handlePickName(entry)}
                    className="w-full py-4 px-5 rounded-xl bg-white/10 border border-ash-mid text-white font-semibold text-base text-left active:bg-white/20 transition"
                  >
                    {entry.full_name}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-red-300 text-sm text-center mt-4 px-2">{error}</p>}
          </div>
        )}

        {/* Step: enter credentials */}
        {step === 'credentials' && selected && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-ash-light text-sm text-center mb-2">
              Welcome, <span className="text-white font-semibold">{selected.full_name}</span>
            </p>
            <div>
              <label className="block text-ash-light text-sm mb-1.5">Your email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-ash-mid text-white placeholder-white/30 focus:outline-none focus:border-ash-light transition text-base"
              />
            </div>
            <div>
              <label className="block text-ash-light text-sm mb-1.5">Choose a password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-ash-mid text-white placeholder-white/30 focus:outline-none focus:border-ash-light transition text-base"
              />
            </div>
            <div>
              <label className="block text-ash-light text-sm mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Re-enter password"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-ash-mid text-white placeholder-white/30 focus:outline-none focus:border-ash-light transition text-base"
              />
            </div>
            {error && <p className="text-red-300 text-sm text-center px-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 rounded-lg bg-ash-mid text-white font-semibold text-base active:scale-[0.98] transition disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('pick'); setError('') }}
              className="w-full py-2 text-ash-light text-sm active:opacity-60"
            >
              ← Back
            </button>
          </form>
        )}

        {/* Step: awaiting email confirmation */}
        {step === 'verify-email' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">📬</div>
            <p className="text-white font-semibold text-lg">Check your inbox</p>
            <p className="text-ash-light text-sm">
              We've sent a confirmation link to <span className="text-white">{email}</span>. Open it to activate your account, then sign in.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3.5 mt-4 rounded-lg bg-ash-mid text-white font-semibold text-base active:scale-[0.98] transition"
            >
              Go to Sign In
            </button>
          </div>
        )}

        <p className="text-center text-white/25 text-xs mt-10">
          ASH Chartered Surveyors · 1-5 Kew Place · Cheltenham GL53 7NQ
        </p>
      </div>
    </div>
  )
}
