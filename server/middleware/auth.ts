import type { Request, Response, NextFunction } from 'express'
import { supabase } from '../services/supabase'

// Extend Express Request so downstream route handlers can read req.userId
// without casting. Set by requireAuth middleware after JWT verification.
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

/**
 * Verifies the Supabase JWT sent in the Authorization: Bearer <token> header.
 * Attaches the verified user ID to req.userId.
 * Rejects with 401 if the header is missing, malformed, or the token is invalid.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorised — Authorization header required' })
    return
  }

  const token = header.slice(7)

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    console.warn('[AUTH] Token verification failed:', error?.message ?? 'no user returned')
    res.status(401).json({ error: 'Unauthorised — invalid or expired token' })
    return
  }

  req.userId = user.id
  next()
}
