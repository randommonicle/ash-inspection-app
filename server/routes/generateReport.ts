import { Router, type Request, type Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase'
import { MODELS } from '../config/models'
import { PROCESS_OBSERVATION_PROMPT } from '../prompts/processObservation'
import { GENERATE_SUMMARY_PROMPT } from '../prompts/generateSummary'
import { buildReportDocx, type ReportObservation, type ReportPhoto, type RecurringItem } from '../services/reportGenerator'
import { sendReportEmail } from '../services/email'
import { convertDocxToPdf } from '../services/pdf'

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

interface PropertyContext {
  propertyName:    string
  propertyRef:     string
  propertyAddress: string
}

async function processObservation(obs: RawObservation, ctx: PropertyContext): Promise<ProcessedResult> {
  console.log(`[REPORT] Processing observation ${obs.id} (${obs.section_key})`)

  // Prepend property context so Sonnet can autocorrect any phonetic misspellings
  // of the property name, reference, or address that occur in voice narrations.
  const userContent = `PROPERTY CONTEXT (use these exact spellings if the narration mentions the property):
Property name: ${ctx.propertyName}
Property ref: ${ctx.propertyRef}
Property address: ${ctx.propertyAddress}

NARRATION:
${obs.raw_narration ?? ''}`

  const msg = await anthropic.messages.create({
    model:      MODELS.OBSERVATION,
    max_tokens: 512,
    system:     PROCESS_OBSERVATION_PROMPT,
    messages:   [{ role: 'user', content: userContent }],
  })

  const raw  = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  const parsed = JSON.parse(text) as ProcessedResult
  console.log(`[REPORT] Observation processed — risk: ${parsed.risk_level ?? 'none'}, action: ${parsed.action_text ? 'yes' : 'no'}`)
  return parsed
}

interface PreviousAction {
  id: string
  section_key: string
  action_text: string
}

async function identifyRecurringItems(
  previousActions: PreviousAction[],
  currentObservations: ReportObservation[],
  previousDate: string,
): Promise<RecurringItem[]> {
  if (previousActions.length === 0 || currentObservations.length === 0) return []

  console.log(`[REPORT] Comparing ${previousActions.length} previous actions against ${currentObservations.length} current observations`)

  const prompt = `You are reviewing two property inspection reports to identify recurring maintenance issues.

PREVIOUS INSPECTION ACTIONS (items that required action last time):
${previousActions.map((a, i) => `[${i}] Section: ${a.section_key}\n    Action: ${a.action_text}`).join('\n\n')}

CURRENT INSPECTION OBSERVATIONS:
${currentObservations.map((o, i) => `[${i}] Section: ${o.section_key}\n    Observation: ${o.processed_text}`).join('\n\n')}

Identify which previous actions appear to STILL BE OUTSTANDING based on the current observations. An issue is recurring if:
- The current inspection describes the same or similar defect in the same area, OR
- The current inspection makes no mention of the area/issue being resolved

An issue is NOT recurring if the current inspection explicitly notes it has been repaired, resolved, or is now satisfactory.

IMPORTANT: Your response must be ONLY a valid JSON array of integers, with no other text before or after it.
Examples of valid responses: [0, 2]   or   [1]   or   []
Do not explain your reasoning. Do not use markdown. Output the JSON array and nothing else.`

  const msg = await anthropic.messages.create({
    model:      MODELS.OBSERVATION,
    max_tokens: 256,
    messages:   [{ role: 'user', content: prompt }],
  })

  const raw  = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  // If the model ignored instructions and returned prose, try to extract an array literal
  let indices: number[]
  try {
    indices = JSON.parse(text)
  } catch {
    const match = text.match(/\[[\d,\s]*\]/)
    indices = match ? JSON.parse(match[0]) : []
    if (!match) console.warn('[RECURRING] Model returned non-JSON — defaulting to no recurring items. Raw:', text.slice(0, 120))
  }

  const items: RecurringItem[] = indices
    .filter(i => i >= 0 && i < previousActions.length)
    .map(i => ({
      section_key:  previousActions[i].section_key,
      issue:        previousActions[i].action_text,
      previousDate,
    }))

  console.log(`[REPORT] Identified ${items.length} recurring item(s)`)
  return items
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
      .select('*, users(full_name, email, job_title), properties(name, ref, address, number_of_units, management_company, has_car_park, has_lift, has_roof_access)')
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
    const inspectorTitle  = (user.job_title as string | null) ?? 'Property Manager'

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
          result = await processObservation(obs, { propertyName, propertyRef, propertyAddress })
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

    // ── 3. Identify recurring items from previous inspection ──────────────────
    let recurringItems: RecurringItem[] = []
    try {
      // Find the most recent completed inspection for this property BEFORE this one
      // Include both 'completed' and 'report_generated' — once a report is
      // generated the status becomes 'report_generated', so querying only
      // 'completed' would never find a previous inspection that had a report.
      const { data: prevRows } = await supabase
        .from('inspections')
        .select('id, start_time')
        .eq('property_id', inspection.property_id)
        .in('status', ['completed', 'report_generated'])
        .neq('id', inspection_id)
        .lt('start_time', inspection.start_time)
        .order('start_time', { ascending: false })
        .limit(1)

      const prevInspection = prevRows?.[0] ?? null
      console.log(`[RECURRING] property_id=${inspection.property_id}, current start=${inspection.start_time}`)
      console.log(`[RECURRING] Previous inspection found: ${prevInspection ? prevInspection.id : 'NONE'}`)

      if (prevInspection) {
        const prevDate = new Date(prevInspection.start_time).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        })

        const { data: prevObs, error: prevObsErr } = await supabase
          .from('observations')
          .select('id, section_key, action_text')
          .eq('inspection_id', prevInspection.id)
          .not('action_text', 'is', null)

        if (prevObsErr) console.warn('[RECURRING] Error fetching previous observations:', prevObsErr.message)
        console.log(`[RECURRING] Previous observations with action_text: ${prevObs?.length ?? 0}`)

        const previousActions: PreviousAction[] = (prevObs ?? [])
          .filter((o: any) => o.action_text)
          .map((o: any) => ({ id: o.id, section_key: o.section_key, action_text: o.action_text }))

        if (previousActions.length === 0) {
          console.log('[RECURRING] No previous actions found — either no issues were flagged last time, or report was never generated for that inspection')
        }

        recurringItems = await identifyRecurringItems(previousActions, processedObservations, prevDate)
      } else {
        console.log('[RECURRING] No previous inspection found — this may be the first inspection for this property, or all prior inspections are newer than this one')
      }
    } catch (err) {
      console.warn('[REPORT] Recurring items check failed (non-fatal):', err)
      recurringItems = []
    }

    // ── 4. Generate overall summary ───────────────────────────────────────────
    const overallSummary = processedObservations.length > 0
      ? await generateSummary(processedObservations)
      : 'No observations were recorded during this inspection.'

    // ── 5. Fetch photos and download image data ───────────────────────────────
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

      // If the photo was never analysed (e.g. server was down during sync),
      // run Opus analysis now so the caption still appears in the report.
      let opusDescription = photo.opus_description ?? null
      if (!opusDescription && imageBuffer) {
        try {
          console.log(`[REPORT] Photo ${photo.id} has no Opus description — analysing now`)
          const base64 = imageBuffer.toString('base64')
          const { analyseImage } = await import('../services/anthropic')
          opusDescription = await analyseImage(base64, 'image/jpeg')
          // Save back so future reports don't need to re-analyse
          await supabase.from('photos').update({ opus_description: opusDescription }).eq('id', photo.id)
          console.log(`[REPORT] Late analysis complete for ${photo.id}: "${opusDescription.suggested_caption}"`)
        } catch (err) {
          console.warn(`[REPORT] Late analysis failed for ${photo.id}:`, err)
        }
      }

      reportPhotos.push({
        id:               photo.id,
        observation_id:   photo.observation_id ?? null,
        caption:          photo.caption ?? null,
        opus_description: opusDescription,
        imageBuffer,
      })
    }

    // ── 6. Build Word document ────────────────────────────────────────────────
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
      inspectorTitle,
      overallSummary,
      observations:     processedObservations,
      photos:           reportPhotos,
      reportGeneratedAt,
      recurringItems,
    })

    // ── 7. Upload to Supabase Storage ─────────────────────────────────────────
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

    // ── 8. Update inspection status ───────────────────────────────────────────
    await supabase.from('inspections').update({
      status:          'report_generated',
      report_docx_url: storagePath,
    }).eq('id', inspection_id)

    // ── 9. Convert to PDF (LibreOffice) ──────────────────────────────────────
    const baseFilename = `ASH_Inspection_${propertyRef}_${inspectionDate.replace(/\s/g, '_')}`
    const pdfBuffer = await convertDocxToPdf(docxBuffer, baseFilename)

    // ── 10. Send email ────────────────────────────────────────────────────────
    if (process.env.RESEND_API_KEY) {
      await sendReportEmail({
        to:             inspectorEmail,
        inspectorName,
        propertyName,
        propertyRef,
        inspectionDate,
        docxBuffer,
        filename:  baseFilename,
        pdfBuffer,
      })
    } else {
      console.warn('[REPORT] RESEND_API_KEY not set — skipping email send')
    }

    console.log(`[REPORT] Report generation complete for inspection ${inspection_id}`)
    res.json({ success: true, filename: baseFilename })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[REPORT] Generation failed:', msg)
    res.status(500).json({ error: `Report generation failed: ${msg}` })
  }
})

export default router
