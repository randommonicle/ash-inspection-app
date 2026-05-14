import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ReportEmailParams {
  to: string
  inspectorName: string
  propertyName: string
  propertyRef: string
  inspectionDate: string
  docxBuffer: Buffer
  filename: string           // base filename without extension, e.g. "ASH_Inspection_B69_1_May_2026"
  htmlBuffer?: Buffer | null // optional self-contained HTML report (click-to-enlarge via inline lightbox)
}

// Resend rejects any email whose content + attachments exceed 40 MB. We size
// against the base64-encoded length (that's what's actually transmitted) and
// keep headroom for the email body and MIME overhead.
const MAX_ATTACHMENTS_B64 = 38 * 1024 * 1024

export async function sendReportEmail(params: ReportEmailParams): Promise<void> {
  const { to, inspectorName, propertyName, propertyRef, inspectionDate, docxBuffer, filename, htmlBuffer } = params

  console.log(`[EMAIL] Sending report to ${to} for ${propertyRef} — ${propertyName}`)

  // The report is sent as a DOCX (canonical editable copy) plus an optional
  // self-contained interactive HTML copy. The PDF was dropped May 2026 — it
  // duplicated the HTML (which prints to PDF in one click) and its photo
  // payload pushed large inspections past Resend's 40 MB cap.
  //
  // DOCX is never dropped. If the total still exceeds the cap (a very
  // photo-heavy inspection), drop the HTML so the email always sends rather
  // than hard-failing the whole report pipeline at the last stage.
  const docxB64 = docxBuffer.toString('base64')
  let   htmlB64 = htmlBuffer ? htmlBuffer.toString('base64') : null

  let droppedHtml = false
  if (htmlB64 && docxB64.length + htmlB64.length > MAX_ATTACHMENTS_B64) {
    htmlB64 = null
    droppedHtml = true
    console.warn(`[EMAIL] Attachments exceeded ${Math.round(MAX_ATTACHMENTS_B64 / 1024 / 1024)} MB — dropped the HTML copy. DOCX always retained.`)
  }

  const droppedNote = droppedHtml
    ? `<p style="color:#b54242;font-size:13px;">Note: this inspection had too many photos to attach the interactive HTML copy within the email size limit. The Word document is attached; the full report (including all photos) is also stored in the cloud and can be re-sent on request.</p>`
    : ''

  const { error } = await resend.emails.send({
    from:    'ASH Property App <reports@propertyappdev.co.uk>',
    to:      to,
    subject: `Inspection Report — ${propertyName} (${propertyRef}) — ${inspectionDate}`,
    html: `
      <p>Dear ${inspectorName},</p>
      <p>Please find attached the property inspection report for <strong>${propertyName}</strong> (${propertyRef}), carried out on ${inspectionDate}.</p>
      ${htmlB64 ? `<p style="color:#555;font-size:13px;">The HTML copy is interactive — tap any photo to enlarge. Download it from this email to view, as most email clients won't preview HTML attachments for security reasons.</p>` : ''}
      ${droppedNote}
      <p>This report was generated automatically by the ASH Inspection App.</p>
      <br />
      <p>ASH Chartered Surveyors</p>
    `,
    attachments: [
      // DOCX — canonical editable copy. Always included.
      {
        filename: `${filename}.docx`,
        content:  docxB64,
      },
      // HTML — self-contained, click-to-enlarge photos, opens in any browser.
      // Suffix "_INTERACTIVE" so it stands out from the docx in the attachment
      // list and the recipient is more likely to download it.
      ...(htmlB64 ? [{
        filename: `${filename}_INTERACTIVE.html`,
        content:  htmlB64,
      }] : []),
    ],
  })

  if (error) {
    console.error('[EMAIL] Resend error:', error)
    throw new Error(`Email send failed: ${JSON.stringify(error)}`)
  }

  console.log(`[EMAIL] Report sent successfully to ${to}${droppedHtml ? ' (HTML dropped — over size cap)' : ''}`)
}
