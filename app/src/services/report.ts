const base = import.meta.env.VITE_API_BASE_URL as string

export async function generateReport(inspectionId: string): Promise<void> {
  console.log(`[REPORT] Requesting report generation for inspection ${inspectionId}`)

  const res = await fetch(`${base}/api/generate-report`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ inspection_id: inspectionId }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg  = (body as { error?: string }).error ?? `HTTP ${res.status}`
    throw new Error(msg)
  }

  console.log(`[REPORT] Report generation complete for inspection ${inspectionId}`)
}
