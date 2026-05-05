import 'dotenv/config'

import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import classifyRouter from './routes/classify'
import analysePhotoRouter from './routes/analysePhoto'
import generateReportRouter from './routes/generateReport'
import transcribeRouter from './routes/transcribe'
import { globalLimiter } from './middleware/rateLimits'

const app  = express()
const port = process.env.PORT ?? 3001

// Trust the Railway / reverse-proxy X-Forwarded-For header so rate limiting
// and logging use the real client IP rather than the proxy's IP.
app.set('trust proxy', 1)

// Allowed origins: the Railway server itself (for any browser-based tooling)
// and the Capacitor app scheme used on Android devices.
const ALLOWED_ORIGINS = [
  'https://ash-inspection-app-production.up.railway.app',
  'https://localhost',          // Capacitor dev
  'capacitor://localhost',      // Capacitor Android (androidScheme: https)
]
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (native Android HTTP, Postman, Railway health checks)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin '${origin}' not allowed`))
  },
}))

// IMPORTANT: /api/transcribe MUST be mounted before express.json() because it
// accepts a raw binary audio body. express.json() would reject the audio blob
// (wrong Content-Type) or corrupt it. The route handles its own body parsing
// via express.raw() internally.
app.use('/api/transcribe', transcribeRouter)

// Hard cap on request body size — prevents oversized payloads from being parsed.
// All our endpoints expect small JSON bodies (IDs and short text); 50 kb is generous.
app.use(express.json({ limit: '50kb' }))

// Apply global rate limit to every route before any other middleware.
app.use(globalLimiter)

// Request logger — logs every inbound request with method, path, and response time
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO'
    console.log(`[${level}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`)
  })
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/api/classify', classifyRouter)
app.use('/api/analyse-photo', analysePhotoRouter)
app.use('/api/generate-report', generateReportRouter)

// Catch-all error handler — prevents unhandled errors returning raw stack traces to the client
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED ERROR]', err.message, err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`[STARTUP] ASH server running on http://localhost:${port}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[STARTUP] WARNING: ANTHROPIC_API_KEY is not set — classification will fail')
  }
})
