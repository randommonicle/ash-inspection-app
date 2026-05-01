import 'dotenv/config'

import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import classifyRouter from './routes/classify'
import analysePhotoRouter from './routes/analysePhoto'
import generateReportRouter from './routes/generateReport'

const app  = express()
const port = process.env.PORT ?? 3001

// TODO [PRODUCTION]: Replace the wildcard CORS origin with the specific
// domain(s) the app will be served from, e.g.:
//   app.use(cors({ origin: ['https://app.ashproperty.co.uk'] }))
// Wildcard is acceptable during local / tunnel testing but must not go live.
app.use(cors())
app.use(express.json())

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
