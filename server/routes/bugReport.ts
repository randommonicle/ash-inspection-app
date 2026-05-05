import { Router } from 'express'
import { Resend } from 'resend'
import { requireAuth } from '../middleware/auth'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

const ADMIN_EMAIL = 'ben240689@proton.me'
const FROM        = 'reports@propertyappdev.co.uk'

router.post('/', requireAuth, async (req, res) => {
  const { type, description, reporterName } = req.body as {
    type: string
    description: string
    reporterName: string
  }

  if (!type || !description || !reporterName) {
    return res.status(400).json({ error: 'Missing fields' })
  }

  try {
    await resend.emails.send({
      from:    FROM,
      to:      ADMIN_EMAIL,
      subject: `[ASH App] ${type === 'bug' ? '🐛 Bug Report' : '💡 Suggestion'} from ${reporterName}`,
      text:    `From: ${reporterName}\nType: ${type}\n\n${description}`,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[BUG REPORT] Email failed:', err instanceof Error ? err.message : err)
    // Non-fatal — the report is already saved in Supabase
    res.json({ ok: true, emailSent: false })
  }
})

export default router
