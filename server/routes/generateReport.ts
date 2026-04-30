import { Router, type Request, type Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase'
import { MODELS } from '../config/models'
import { PROCESS_OBSERVATION_PROMPT } from '../prompts/processObservation'
import { GENERATE_SUMMARY_PROMPT } from '../prompts/generateSummary'
import { buildReportDocx, type ReportObservation, type ReportPhoto } from '../services/reportGenerator'
import { sendReportEmail } from '../services/email'

const router  = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface RawObservation {
  id: string
  section_key: string
  template_order: number
  raw_narration: string | null
  processed_text: string | null
  action_text: string | null
  risk_level: string | null
}

interface ProcessedResult {
  processed_text: string
  action_text: string | null
  risk_level: 'High' | 'Medium' | 'Low' | null
}

async function processObservation(obs: RawObservation): Promise<ProcessedResult> {
  console.log(`[REPORT] Processing observation ${obs.id} (${obs.section_key})`)

  const msg = await anthropic.messages.create({
    model:      MODELS.OBSERVATION,
    max_tokens: 512,
    system:     PROCESS_OBSERVATION_PROMPT,
    messages:   [{ role: 'user', content: obs.raw_narration ?? '' }],
  })

  const raw  = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  const parsed = JSON.parse(text) as ProcessedResult
  console.log(`[REPORT] Observation processed — risk: ${parsed.risk_level ?? 'none'}, action: ${parsed.action_text ? 'yes' : 'no'}`)
  return parsed
}

async function generateSummary(observations: ReportObservation[]): Promise<string> {
  console.log(`[REPORT] Generating overall condition summary`)

  const input = observations
    .map(o => `[${o.section_key}] ${o.processed_text}`)
    .join('\n')

  const msg = await anthropic.messages.create({
    model:      MODELS.SUMMARY,
    max_tokens: 256,
    system:     GENERATE_SUMMARY_PROMPT,
    messages:   [{ role: 'user', content: input }],
  })

  const summary = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  console.log(`[REPORT] Summary generated (${summary.length} chars)`)
  return summary
}

router.post('/', async (req: Request, res: Response) => {
  const { inspection_id } = req.body as { inspection_id?: string }

  if (!inspection_id) {
    res.status(400).json({ error: 'inspection_id is required' })
    return
  }

  console.log(`[REPORT] Report generation requested for inspection ${inspection_id}`)

  try {
    // ── 1. Fetch inspection, inspector, and property details ──────────────────
    const { data: inspection, error: inspErr } = await supabase
      .from('inspections')
      .select('*, users(full_name, email), properties(name, ref, address, number_of_units, management_company, has_car_park, has_lift, has_roof_access)')
      .eq('id', inspection_id)
      .single()

    if (inspErr || !inspection) {
      console.error('[REPORT] Inspection not found:', inspErr?.message)
      res.status(404).json({ error: 'Inspection not found' })
      return
    }

    const prop            = inspection.properties as any
    const user            = inspection.users as any
    const propertyName    = prop.name as string
    const propertyRef     = prop.ref as string
    const propertyAddress = prop.address as string
    const propertyUnits   = prop.number_of_units as number
    const managementCo    = prop.management_company as string
    const propertyFlags   = {
      has_car_park:    prop.has_car_park as boolean,
      has_lift:        prop.has_lift as boolean,
      has_roof_access: prop.has_roof_access as boolean,
    }
    const inspectorName   = user.full_name as string
    const inspectorEmail  = user.email as string

    const startDate = new Date(inspection.start_time)
    const inspectionDate = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const startTime      = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const endTime        = inspection.end_time
      ? new Date(inspection.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : null
    const reportGeneratedAt = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    console.log(`[REPORT] Generating for ${propertyName} (${propertyRef}), inspector: ${inspectorName}`)

    // ── 2. Fetch and process observations ─────────────────────────────────────
    const { data: rawObs, error: obsErr } = await supabase
      .from('observations')
      .select('id, section_key, template_order, raw_narration, processed_text, action_text, risk_level')
      .eq('inspection_id', inspection_id)
      .order('template_order', { ascending: true })

    if (obsErr) throw new Error(`Fetch observations: ${obsErr.message}`)
    console.log(`[REPORT] Fetched ${rawObs?.length ?? 0} observations`)

    const processedObservations: ReportObservation[] = []

    for (const obs of (rawObs ?? []) as RawObservation[]) {
      let result: ProcessedResult

      if (obs.processed_text) {
        result = {
          processed_text: obs.processed_text,
          action_text:    obs.action_text,
          risk_level:     obs.risk_level as 'High' | 'Medium' | 'Low' | null,
        }
      } else if (obs.raw_narration) {
        try {
          result = await processObservation(obs)
          await supabase.from('observations').update({
            processed_text: result.processed_text,
            action_text:    result.action_text,
            risk_level:     result.risk_level,
          }).eq('id', obs.id)
        } catch (err) {
          console.error(`[REPORT] Failed to process observation ${obs.id}:`, err)
          result = { processed_text: obs.raw_narration, action_text: null, risk_level: null }
        }
      } else {
        console.warn(`[REPORT] Observation ${obs.id} has no narration — skipping`)
        continue
      }

      processedObservations.push({
        id:             obs.id,
        section_key:    obs.section_key,
        template_order: obs.template_order,
        ...result,
      })
    }

    // ── 3. Generate overall summary ───────────────────────────────────────────
    const overallSummary = processedObservations.length > 0
      ? await generateSummary(processedObservations)
      : 'No observations were recorded during this inspection.'

    // ── 4. Fetch photos and download image data ───────────────────────────────
    const { data: rawPhotos, error: photoErr } = await supabase
      .from('photos')
      .select('id, observation_id, storage_path, caption, opus_description')
      .eq('inspection_id', inspection_id)

    if (photoErr) throw new Error(`Fetch photos: ${photoErr.message}`)
    console.log(`[REPORT] Fetched ${rawPhotos?.length ?? 0} photos`)

    const reportPhotos: ReportPhoto[] = []

    for (const photo of (rawPhotos ?? [])) {
      let imageBuffer: Buffer | null = null

      if (photo.storage_path) {
        try {
          const { data: fileData, error: dlErr } = await supabase.storage
            .from('inspection-files')
            .download(photo.storage_path)

          if (dlErr) {
            console.warn(`[REPORT] Photo ${photo.id} download failed:`, dlErr.message)
          } else {
            imageBuffer = Buffer.from(await fileData.arrayBuffer())
            console.log(`[REPORT] Photo ${photo.id} downloaded (${imageBuffer.byteLength} bytes)`)
          }
        } catch (err) {
          console.warn(`[REPORT] Photo ${photo.id} download error:`, err)
        }
      }

      reportPhotos.push({
        id:               photo.id,
        observation_id:   photo.observation_id ?? null,
        caption:          photo.caption ?? null,
        opus_description: photo.opus_description ?? null,
        imageBuffer,
      })
    }

    // ── 5. Build Word document ────────────────────────────────────────────────
    const docxBuffer = await buildReportDocx({
      propertyName,
      propertyRef,
      propertyAddress,
      propertyUnits,
      managementCompany: managementCo,
      propertyFlags,
      inspectionDate,
      startTime,
      endTime,
      weather:          inspection.weather ?? null,
      nextInspection:   inspection.next_inspection ?? null,
      inspectorName,
      overallSummary,
      observations:     processedObservations,
      photos:           reportPhotos,
      reportGeneratedAt,
    })

    // ── 6. Upload to Supabase Storage ─────────────────────────────────────────
    const storagePath = `${inspection.property_id}/${inspection_id}/report.docx`
    const { error: uploadErr } = await supabase.storage
      .from('inspection-files')
      .upload(storagePath, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      })

    if (uploadErr) {
      console.error('[REPORT] Storage upload failed:', uploadErr.message)
    } else {
      console.log(`[REPORT] Report uploaded to ${storagePath}`)
    }

    // ── 7. Update inspection status ───────────────────────────────────────────
    await supabase.from('inspections').update({
      status:          'report_generated',
      report_docx_url: storagePath,
    }).eq('id', inspection_id)

    // ── 8. Send email ─────────────────────────────────────────────────────────
    const filename = `ASH_Inspection_${propertyRef}_${inspectionDate.replace(/\s/g, '_')}.docx`

    if (process.env.RESEND_API_KEY) {
      await sendReportEmail({
        to:             inspectorEmail,
        inspectorName,
        propertyName,
        propertyRef,
        inspectionDate,
        docxBuffer,
        filename,
      })
    } else {
      console.warn('[REPORT] RESEND_API_KEY not set — skipping email send')
    }

    console.log(`[REPORT] Report generation complete for inspection ${inspection_id}`)
    res.json({ success: true, filename })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[REPORT] Generation failed:', msg)
    res.status(500).json({ error: `Report generation failed: ${msg}` })
  }
})

export default router
