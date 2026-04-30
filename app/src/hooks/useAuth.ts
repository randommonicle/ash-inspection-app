import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import type { UserProfile } from '../types'

interface AuthState {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true })

  useEffect(() => {
    const timeout = setTimeout(() => {
      setState({ session: null, profile: null, loading: false })
    }, 8000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout)
      const profile = session ? await fetchProfile(session.user.id) : null
      setState({ session, profile, loading: false })
    }).catch(() => {
      clearTimeout(timeout)
      setState({ session: null, profile: null, loading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const profile = session ? await fetchProfile(session.user.id) : null
      setState(prev => ({ ...prev, session, profile }))
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setState({ session: null, profile: null, loading: false })
  }

  return { ...state, signIn, signOut }
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  return data ?? null
}
