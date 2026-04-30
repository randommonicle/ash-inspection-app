import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen bg-ash-navy px-6 select-none">
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <div className="text-center mb-10">
          <div className="inline-flex flex-col items-center">
            <span className="text-4xl font-bold tracking-[0.25em] text-white">ASH</span>
            <span className="text-ash-light text-xs tracking-widest uppercase mt-1">
              Chartered Surveyors
            </span>
          </div>
          <div className="mt-6 h-px bg-ash-mid" />
          <p className="text-ash-light text-xs tracking-widest uppercase mt-3">
            Property Inspections
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-ash-light text-sm mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              className="
                w-full px-4 py-3 rounded-lg
                bg-white/10 border border-ash-mid
                text-white placeholder-white/30
                focus:outline-none focus:border-ash-light focus:bg-white/15
                transition text-base
              "
              placeholder="you@ashproperty.co.uk"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-ash-light text-sm mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="
                w-full px-4 py-3 rounded-lg
                bg-white/10 border border-ash-mid
                text-white placeholder-white/30
                focus:outline-none focus:border-ash-light focus:bg-white/15
                transition text-base
              "
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-300 text-sm text-center px-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full py-3.5 mt-2 rounded-lg
              bg-ash-mid text-white font-semibold text-base
              hover:bg-[#3a68b8] active:scale-[0.98]
              transition disabled:opacity-50
            "
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/25 text-xs mt-12">
          ASH Chartered Surveyors · 1-5 Kew Place · Cheltenham GL53 7NQ
        </p>
      </div>
    </div>
  )
}
