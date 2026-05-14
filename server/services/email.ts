import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ReportEmailParams {
  to: string
  inspectorName: string
  propertyName: string
  propertyRef: string
  inspectionDate: string
  docxBuffer: Buffer
  filename: string                  // base filename without extension, e.g. "ASH_Inspection_B69_1_May_2026"
  htmlBuffer?: Buffer | null        // optional self-contained HTML report (click-to-enlarge via inline lightbox)
  docxDownloadUrl?: string | null   // signed Storage URL — link fallback if the DOCX won't fit as an attachment
  htmlDownloadUrl?: string | null   // signed Storage URL — link fallback if the HTML won't fit as an attachment
}

// Resend rejects any email whose content + attachments exceed 40 MB. We size
// against the base64-encoded length (that's what's actually transmitted) and
// keep headroom for the email body and MIME overhead.
const MAX_ATTACHMENTS_B64 = 38 * 1024 * 1024

interface Attachment { filename: string; content: string }

export async function sendReportEmail(params: ReportEmailParams): Promise<void> {
  const {
    to, inspectorName, propertyName, propertyRef, inspectionDate,
    docxBuffer, filename, htmlBuffer, docxDownloadUrl, htmlDownloadUrl,
  } = params

  console.log(`[EMAIL] Sending report to ${to} for ${propertyRef} — ${propertyName}`)

  // Greedily attach what fits under Resend's cap — DOCX first (the canonical
  // editable copy), then the interactive HTML. Anything that doesn't fit is
  // delivered as a Supabase Storage download link in the body instead. This
  // guarantees the email always sends rather than hard-failing the whole
  // report pipeline at the last stage on a photo-heavy inspection.
  const docxB64 = docxBuffer.toString('base64')
  const htmlB64 = htmlBuffer ? htmlBuffer.toString('base64') : null

  const attachments: Attachment[] = []
  const linkLines:   string[]     = []
  let usedB64 = 0

  // DOCX — attach if it fits, otherwise fall back to a download link.
  if (docxB64.length <= MAX_ATTACHMENTS_B64) {
    attachments.push({ filename: `${filename}.docx`, content: docxB64 })
    usedB64 += docxB64.length
  } else if (docxDownloadUrl) {
    linkLines.push(`<a href="${docxDownloadUrl}">Download the Word report (.docx)</a>`)
    console.warn('[EMAIL] DOCX over size cap — delivered as a download link instead')
  } else {
    linkLines.push('The Word report was too large to attach and no download link is available — please regenerate the report or contact support.')
    console.error('[EMAIL] DOCX over size cap and no download URL available')
  }

  // HTML — attach if it fits in the remaining budget, otherwise download link.
  if (htmlB64) {
    if (usedB64 + htmlB64.length <= MAX_ATTACHMENTS_B64) {
      attachments.push({ filename: `${filename}_INTERACTIVE.html`, content: htmlB64 })
      usedB64 += htmlB64.length
    } else if (htmlDownloadUrl) {
      linkLines.push(`<a href="${htmlDownloadUrl}">Download the interactive HTML report</a>`)
      console.warn('[EMAIL] HTML over remaining size budget — delivered as a download link instead')
    } else {
      console.warn('[EMAIL] HTML over size budget and no download URL — omitted from this email')
    }
  }

  const htmlAttached = attachments.some(a => a.filename.endsWith('.html'))
  const linkBlock = linkLines.length > 0
    ? `<p style="color:#b54242;font-size:13px;">This inspection had a lot of photos, so ${linkLines.length > 1 ? 'some report copies are' : 'one report copy is'} provided as a secure download link rather than an attachment:</p>
       <ul style="font-size:13px;">${linkLines.map(l => `<li>${l}</li>`).join('')}</ul>`
    : ''

  const { error } = await resend.emails.send({
    from:    'ASH Property App <reports@propertyappdev.co.uk>',
    to:      to,
    subject: `Inspection Report — ${propertyName} (${propertyRef}) — ${inspectionDate}`,
    html: `
      <p>Dear ${inspectorName},</p>
      <p>Please find ${attachments.length > 0 ? 'attached' : 'below'} the property inspection report for <strong>${propertyName}</strong> (${propertyRef}), carried out on ${inspectionDate}.</p>
      ${htmlAttached ? `<p style="color:#555;font-size:13px;">The HTML copy is interactive — tap any photo to enlarge. Download it from this email to view, as most email clients won't preview HTML attachments for security reasons.</p>` : ''}
      ${linkBlock}
      <p>This report was generated automatically by the ASH Inspection App.</p>
      <br />
      <p>ASH Chartered Surveyors</p>
    `,
    attachments,
  })

  if (error) {
    console.error('[EMAIL] Resend error:', error)
    throw new Error(`Email send failed: ${JSON.stringify(error)}`)
  }

  console.log(`[EMAIL] Report sent successfully to ${to} — ${attachments.length} attachment(s), ${linkLines.length} download link(s)`)
}
