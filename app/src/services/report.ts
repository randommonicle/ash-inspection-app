import { authHeaders } from './apiClient'

const base = import.meta.env.VITE_API_BASE_URL as string

// Human-readable labels for each pipeline stage emitted by /api/generate-report.
// Keep in sync with the `currentStage` assignments in server/routes/generateReport.ts.
const STAGE_LABEL: Record<string, string> = {
  init:                          'starting up',
  fetch_inspection:              'loading inspection details',
  process_observations:          'processing observations',
  fetch_photos:                  'downloading photos',
  synthesise_photo_observations: 'describing photos',
  identify_recurring_items:      'comparing with previous inspection',
  summary_and_weather:           'generating summary and fetching weather',
  build_docx:                    'building the report document',
  upload_docx:                   'uploading the report',
  convert_pdf:                   'converting to PDF',
  send_email:                    'sending the email',
}

/**
 * ReportError preserves the stage the server failed at so the UI can show
 * something more helpful than "report generation failed". Thrown only on
 * HTTP failures from /api/generate-report — network errors bubble up as
 * plain Errors from fetch().
 */
export class ReportError extends Error {
  stage:      string
  stageLabel: string
  constructor(stage: string, message: string) {
    super(message)
    this.name       = 'ReportError'
    this.stage      = stage
    this.stageLabel = STAGE_LABEL[stage] ?? stage
  }
}

export async function generateReport(inspectionId: string): Promise<void> {
  console.log(`[REPORT] Requesting report generation for inspection ${inspectionId}`)

  const res = await fetch(`${base}/api/generate-report`, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ inspection_id: inspectionId }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as {
      ok?:      boolean
      stage?:   string
      message?: string
      error?:   string   // legacy shape — kept so older deployments still surface a useful message
    }
    const stage = body.stage   ?? 'unknown'
    const msg   = body.message ?? body.error ?? `HTTP ${res.status}`
    throw new ReportError(stage, msg)
  }

  console.log(`[REPORT] Report generation complete for inspection ${inspectionId}`)
}
