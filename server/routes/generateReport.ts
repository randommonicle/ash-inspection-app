import { Router, type Request, type Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../services/supabase'
import { MODELS } from '../config/models'
import { PROCESS_OBSERVATION_PROMPT } from '../prompts/processObservation'
import { GENERATE_SUMMARY_PROMPT } from '../prompts/generateSummary'
import { buildReportDocx, type ReportObservation, type ReportPhoto, type RecurringItem } from '../services/reportGenerator'
import { buildReportHtml } from '../services/htmlReportGenerator'
import { sendReportEmail } from '../services/email'
import { convertDocxToPdf } from '../services/pdf'
import { resizeForReport } from '../services/imageProcessor'
import { getWeatherForInspection } from '../services/weather'
import { requireAuth } from '../middleware/auth'
import { reportLimiter } from '../middleware/rateLimits'
import { logUsage, calcAnthropicCost } from '../services/usageLogger'

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

interface LogCtx {
  inspectionId: string
  userId:       string
}

async function processObservation(obs: RawObservation, ctx: PropertyContext, logCtx: LogCtx): Promise<ProcessedResult> {
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

  logUsage({
    service: 'anthropic', model: MODELS.OBSERVATION, endpoint: 'generate-report/observation',
    inspection_id: logCtx.inspectionId, user_id: logCtx.userId,
    input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens,
    cost_usd: calcAnthropicCost(MODELS.OBSERVATION, msg.usage.input_tokens, msg.usage.output_tokens),
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
  logCtx: LogCtx,
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

  logUsage({
    service: 'anthropic', model: MODELS.OBSERVATION, endpoint: 'generate-report/recurring',
    inspection_id: logCtx.inspectionId, user_id: logCtx.userId,
    input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens,
    cost_usd: calcAnthropicCost(MODELS.OBSERVATION, msg.usage.input_tokens, msg.usage.output_tokens),
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

const SECTION_LABELS_FOR_SYNTHESIS: Record<string, string> = {
  external_approach: 'External Approach and Entrance',
  grounds:           'Grounds and Landscaping',
  bin_store:         'Bin Store and Waste Facilities',
  car_park:          'Car Park',
  external_fabric:   'External Fabric and Elevations',
  roof:              'Roof and Roof Terrace',
  communal_entrance: 'Communal Entrance and Reception',
  stairwells:        'Stairwells and Circulation',
  lifts:             'Lifts',
  plant_room:        'Plant Room and Utilities',
  meter_reads:       'Meter Reads and Utility Services',
  internal_communal: 'Internal Communal Areas (General)',
  additional:        'Additional / Property-Specific Areas',
}

async function synthesiseFromPhotos(
  sectionKey: string,
  photos: ReportPhoto[],
  ctx: PropertyContext,
  inspectionDate: string,
  logCtx: LogCtx,
): Promise<ProcessedResult | null> {
  const analysed = photos.filter(p => p.opus_description?.description)
  if (analysed.length === 0) return null

  const sectionLabel = SECTION_LABELS_FOR_SYNTHESIS[sectionKey] ?? sectionKey

  const photoLines = analysed.map((p, i) => {
    const desc   = p.opus_description!.description!
    const issues = p.opus_description!.notable_issues ?? []
    return `Photo ${i + 1}:\nDescription: ${desc}${issues.length > 0 ? `\nNotable issues: ${issues.join(', ')}` : ''}`
  }).join('\n\n')

  const prompt = `You are a property management professional writing a section of a UK residential leasehold property inspection report.

The following photographs were taken in the "${sectionLabel}" area of ${ctx.propertyName} (${ctx.propertyRef}) during an inspection on ${inspectionDate}. Each photograph has been automatically described:

${photoLines}

Write a single professional observation paragraph for this section. Consolidate the photographic evidence into coherent prose as a property manager would write it — clear, factual, third-person, present tense. Then identify the most significant action required (if any) and its risk level.

Respond ONLY with valid JSON:
{
  "processed_text": "<professional observation paragraph>",
  "action_text": "<action required, or null if no action needed>",
  "risk_level": "High" | "Medium" | "Low" | null
}

Risk levels: High = immediate safety or legal risk (within 5 working days), Medium = maintenance required (within 30 days), Low = minor defect (within 90 days). Use null if no action is required.`

  console.log(`[REPORT] Synthesising observation for ${sectionKey} from ${analysed.length} photo(s)`)

  const msg = await anthropic.messages.create({
    model:      MODELS.OBSERVATION,
    max_tokens: 512,
    messages:   [{ role: 'user', content: prompt }],
  })

  logUsage({
    service: 'anthropic', model: MODELS.OBSERVATION, endpoint: 'generate-report/synthesis',
    inspection_id: logCtx.inspectionId, user_id: logCtx.userId,
    input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens,
    cost_usd: calcAnthropicCost(MODELS.OBSERVATION, msg.usage.input_tokens, msg.usage.output_tokens),
  })

  const raw  = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    const result = JSON.parse(text) as ProcessedResult
    console.log(`[REPORT] Synthesised ${sectionKey} — risk: ${result.risk_level ?? 'none'}`)
    return result
  } catch {
    console.warn(`[REPORT] Failed to parse synthesis for ${sectionKey} — raw: ${text.slice(0, 120)}`)
    return null
  }
}

async function generateSummary(observations: ReportObservation[], logCtx: LogCtx): Promise<string> {
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

  logUsage({
    service: 'anthropic', model: MODELS.SUMMARY, endpoint: 'generate-report/summary',
    inspection_id: logCtx.inspectionId, user_id: logCtx.userId,
    input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens,
    cost_usd: calcAnthropicCost(MODELS.SUMMARY, msg.usage.input_tokens, msg.usage.output_tokens),
  })

  const summary = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  console.log(`[REPORT] Summary generated (${summary.length} chars)`)
  return summary
}

router.post('/', requireAuth, reportLimiter, async (req: Request, res: Response) => {
  const { inspection_id } = req.body as { inspection_id?: string }

  if (!inspection_id || typeof inspection_id !== 'string') {
    res.status(400).json({ error: 'inspection_id is required' })
    return
  }

  console.log(`[REPORT] User ${req.userId} requested report for inspection ${inspection_id}`)

  // Stage tracker — PropOS convention: pipeline routes return {ok:false, stage,
  // message} so the client can surface where the failure occurred. Update this
  // before each numbered stage below; the catch at the bottom reads it.
  let currentStage = 'init'

  try {
    // ── 1. Fetch inspection, inspector, and property details ──────────────────
    currentStage = 'fetch_inspection'
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

    // Ownership check — only the inspector who conducted the inspection can
    // generate its report. This prevents cross-user data access and cost abuse.
    if (inspection.inspector_id !== req.userId) {
      console.warn(`[REPORT] User ${req.userId} attempted to generate report for inspection owned by ${inspection.inspector_id}`)
      res.status(403).json({ error: 'Forbidden — this inspection belongs to another inspector' })
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

    const logCtx: LogCtx = { inspectionId: inspection_id, userId: req.userId! }

    // ── 2. Fetch and process observations ─────────────────────────────────────
    currentStage = 'process_observations'
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
          result = await processObservation(obs, { propertyName, propertyRef, propertyAddress }, logCtx)
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

    // ── 3. Fetch photos, download image data, run any late Opus analysis ─────
    currentStage = 'fetch_photos'
    const { data: rawPhotos, error: photoErr } = await supabase
      .from('photos')
      .select('id, observation_id, storage_path, caption, opus_description')
      .eq('inspection_id', inspection_id)

    if (photoErr) throw new Error(`Fetch photos: ${photoErr.message}`)
    console.log(`[REPORT] Fetched ${rawPhotos?.length ?? 0} photos`)

    const reportPhotos: ReportPhoto[] = []

    // Feature flag: ENABLE_PHOTO_HYPERLINKS — when "true", each photo in the
    // report is wrapped in a signed Supabase URL so tapping it in the PDF
    // opens the full-res image. Off by default. Toggle via Railway Variables
    // without redeploying. See CLAUDE.md "Click-to-enlarge photo links" for
    // the trade-offs (link rot on service-key rotation, archival concerns).
    const photoHyperlinksEnabled = process.env.ENABLE_PHOTO_HYPERLINKS === 'true'
    const HI_RES_URL_TTL_SECONDS = 10 * 365 * 24 * 60 * 60 // ~10 years

    for (const photo of (rawPhotos ?? [])) {
      let imageBuffer: Buffer | null = null
      let imageWidth:  number | null = null
      let imageHeight: number | null = null
      let hiResUrl:    string | null = null

      if (photo.storage_path) {
        try {
          const { data: fileData, error: dlErr } = await supabase.storage
            .from('inspection-files')
            .download(photo.storage_path)

          if (dlErr) {
            console.warn(`[REPORT] Photo ${photo.id} download failed:`, dlErr.message)
          } else {
            const rawBuffer = Buffer.from(await fileData.arrayBuffer())
            // Resize once and reuse for both Opus analysis and DOCX embed. Modern
            // phone photos (>5 MB) get rejected by Anthropic vision and balloon
            // the report past Resend's 40 MB cap if embedded raw.
            try {
              const resized = await resizeForReport(rawBuffer)
              imageBuffer = resized.buffer
              imageWidth  = resized.width
              imageHeight = resized.height
              console.log(`[REPORT] Photo ${photo.id} downloaded and resized (${rawBuffer.byteLength} → ${imageBuffer.byteLength} bytes, ${imageWidth}×${imageHeight})`)
            } catch (resizeErr) {
              imageBuffer = rawBuffer
              console.warn(`[REPORT] Photo ${photo.id} resize failed, using raw ${rawBuffer.byteLength} bytes:`, resizeErr instanceof Error ? resizeErr.message : resizeErr)
            }
          }
        } catch (err) {
          console.warn(`[REPORT] Photo ${photo.id} download error:`, err)
        }

        // Generate a long-lived signed URL for click-to-enlarge, only when
        // the feature flag is enabled. Done after download so a 404'd storage
        // path doesn't produce a dead link in the report.
        if (photoHyperlinksEnabled && imageBuffer) {
          try {
            const { data: signed, error: signErr } = await supabase.storage
              .from('inspection-files')
              .createSignedUrl(photo.storage_path, HI_RES_URL_TTL_SECONDS)
            if (signErr) {
              console.warn(`[REPORT] Photo ${photo.id} signed URL failed:`, signErr.message)
            } else if (signed?.signedUrl) {
              hiResUrl = signed.signedUrl
            }
          } catch (err) {
            console.warn(`[REPORT] Photo ${photo.id} signed URL error:`, err)
          }
        }
      }

      let opusDescription = photo.opus_description ?? null
      if (!opusDescription && imageBuffer) {
        try {
          console.log(`[REPORT] Photo ${photo.id} has no Opus description — analysing now`)
          const base64 = imageBuffer.toString('base64')
          const { analyseImage } = await import('../services/anthropic')
          opusDescription = await analyseImage(base64, 'image/jpeg', logCtx)
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
        imageWidth,
        imageHeight,
        hiResUrl,
      })
    }

    // ── 4. Synthesise observations for sections that have photos but no narration
    currentStage = 'synthesise_photo_observations'
    const SECTION_ORDER_FOR_SYNTHESIS = [
      'external_approach', 'grounds', 'bin_store', 'car_park',
      'external_fabric', 'roof', 'communal_entrance', 'stairwells',
      'lifts', 'plant_room', 'meter_reads', 'internal_communal', 'additional',
    ]
    const SECTION_FLAGS_FOR_SYNTHESIS: Record<string, keyof typeof propertyFlags> = {
      car_park: 'has_car_park',
      lifts:    'has_lift',
      roof:     'has_roof_access',
    }

    // Group unlinked photos by their Opus section_key
    const photosBySectionForSynthesis = new Map<string, ReportPhoto[]>()
    for (const photo of reportPhotos) {
      if (!photo.observation_id && photo.opus_description?.section_key) {
        const key = photo.opus_description.section_key
        const arr = photosBySectionForSynthesis.get(key) ?? []
        arr.push(photo)
        photosBySectionForSynthesis.set(key, arr)
      }
    }

    // Sections already covered by narration-based observations
    const coveredSections = new Set(processedObservations.map(o => o.section_key))

    for (const sectionKey of SECTION_ORDER_FOR_SYNTHESIS) {
      // Skip sections gated by a false property flag
      const flag = SECTION_FLAGS_FOR_SYNTHESIS[sectionKey]
      if (flag && !propertyFlags[flag]) continue
      // Skip if narration observations already cover this section
      if (coveredSections.has(sectionKey)) continue

      const sectionPhotos = photosBySectionForSynthesis.get(sectionKey) ?? []
      if (sectionPhotos.length === 0) continue

      try {
        const result = await synthesiseFromPhotos(
          sectionKey,
          sectionPhotos,
          { propertyName, propertyRef, propertyAddress },
          inspectionDate,
          logCtx,
        )
        if (result) {
          const templateOrder = SECTION_ORDER_FOR_SYNTHESIS.indexOf(sectionKey)
          processedObservations.push({
            id:             `synth_${sectionKey}`,
            section_key:    sectionKey,
            template_order: templateOrder,
            ...result,
          })
          console.log(`[REPORT] Photo-derived observation added for section: ${sectionKey}`)
        }
      } catch (err) {
        console.warn(`[REPORT] Synthesis failed for ${sectionKey} (non-fatal):`, err)
      }
    }

    // Re-sort processedObservations by template_order after any synthesis additions
    processedObservations.sort((a, b) => a.template_order - b.template_order)

    // ── 5. Identify recurring items from previous inspection ──────────────────
    currentStage = 'identify_recurring_items'
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

        recurringItems = await identifyRecurringItems(previousActions, processedObservations, prevDate, logCtx)
      } else {
        console.log('[RECURRING] No previous inspection found — this may be the first inspection for this property, or all prior inspections are newer than this one')
      }
    } catch (err) {
      console.warn('[REPORT] Recurring items check failed (non-fatal):', err)
      recurringItems = []
    }

    // ── 6. Generate summary + fetch weather concurrently ─────────────────────
    currentStage = 'summary_and_weather'
    const [overallSummary, weatherStr] = await Promise.all([
      processedObservations.length > 0
        ? generateSummary(processedObservations, logCtx).catch((err) => {
            console.warn('[REPORT] Summary generation failed (non-fatal):', err instanceof Error ? err.message : err)
            return 'Overall condition summary could not be generated automatically. Please review the observations and actions recorded below.'
          })
        : Promise.resolve('No observations were recorded during this inspection.'),
      getWeatherForInspection(propertyAddress, inspection.start_time),
    ])

    // Projected next inspection: one calendar month after the inspection date.
    // Labelled "projected" since bank holidays and leave are not accounted for.
    const nextInspDate = new Date(startDate)
    nextInspDate.setMonth(nextInspDate.getMonth() + 1)
    const nextInspection = nextInspDate.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }) + ' (projected)'

    // ── 7. Build Word document + HTML twin ────────────────────────────────────
    currentStage = 'build_docx'
    const reportData = {
      propertyName,
      propertyRef,
      propertyAddress,
      propertyUnits,
      managementCompany: managementCo,
      propertyFlags,
      inspectionDate,
      startTime,
      endTime,
      weather:          weatherStr,
      nextInspection:   nextInspection,
      inspectorName,
      inspectorTitle,
      inspectorEmail,
      overallSummary,
      observations:     processedObservations,
      photos:           reportPhotos,
      reportGeneratedAt,
      recurringItems,
    }
    const docxBuffer = await buildReportDocx(reportData)
    // HTML failures are non-fatal — the DOCX/PDF are the primary deliverables.
    // If the HTML renderer throws we still send the email without it rather
    // than losing the whole report.
    let htmlBuffer: Buffer | null = null
    try {
      htmlBuffer = buildReportHtml(reportData)
      console.log(`[REPORT] HTML twin built (${htmlBuffer.byteLength} bytes)`)
    } catch (htmlErr) {
      console.warn('[REPORT] HTML twin failed (non-fatal):', htmlErr instanceof Error ? htmlErr.message : htmlErr)
    }

    // ── 8. Upload to Supabase Storage ─────────────────────────────────────────
    currentStage = 'upload_docx'
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
    currentStage = 'convert_pdf'
    const baseFilename = `ASH_Inspection_${propertyRef}_${inspectionDate.replace(/\s/g, '_')}`
    const pdfBuffer = await convertDocxToPdf(docxBuffer, baseFilename)

    // ── 10. Send email ────────────────────────────────────────────────────────
    currentStage = 'send_email'
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
        htmlBuffer,
      })
    } else {
      console.warn('[REPORT] RESEND_API_KEY not set — skipping email send')
    }

    console.log(`[REPORT] Report generation complete for inspection ${inspection_id}`)
    res.json({ ok: true, filename: baseFilename })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[REPORT] Generation failed at stage '${currentStage}':`, msg)
    // PropOS-style staged error envelope. `stage` lets the client tell the user
    // which step broke ("Couldn't build the report document" vs "Couldn't send
    // the email") rather than showing a generic failure.
    res.status(500).json({ ok: false, stage: currentStage, message: msg })
  }
})

export default router
