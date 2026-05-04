/**
 * Shared helper for authenticated calls to the ASH backend server.
 *
 * Every server route now requires a valid Supabase JWT in the
 * Authorization header. This module retrieves the current session
 * and builds the header map so individual service files don't
 * need to duplicate this logic.
 */
import { supabase } from './supabase'

/**
 * Returns headers suitable for a JSON POST to the backend server,
 * including the current user's Supabase JWT.
 * Throws if the user is not logged in (should never happen in normal flow).
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Not authenticated — please log in again')
  }

  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  }
}
