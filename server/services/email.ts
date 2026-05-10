import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ReportEmailParams {
  to: string
  inspectorName: string
  propertyName: string
  propertyRef: string
  inspectionDate: string
  docxBuffer: Buffer
  filename: string          // base filename without extension, e.g. "ASH_Inspection_B69_1_May_2026"
  pdfBuffer?: Buffer | null // optional — attached if provided
}

export async function sendReportEmail(params: ReportEmailParams): Promise<void> {
  const { to, inspectorName, propertyName, propertyRef, inspectionDate, docxBuffer, filename, pdfBuffer } = params

  // FORWARD: PROD-GATE — remove REPORT_TO_OVERRIDE from Railway Variables (and
  // delete this fallback) before client-facing use. With the env var set, every
  // report is routed to one address regardless of which inspector generated it;
  // useful for dev/field tests, unacceptable in production. Grep "PROD-GATE"
  // across the repo for the full manifest of PoC-grade compromises to remove.
  const recipient = process.env.REPORT_TO_OVERRIDE ?? to
  console.log(`[EMAIL] Sending report to ${recipient} for ${propertyRef} — ${propertyName}`)

  const { error } = await resend.emails.send({
    from:    'ASH Property App <reports@propertyappdev.co.uk>',
    to:      recipient,
    subject: `Inspection Report — ${propertyName} (${propertyRef}) — ${inspectionDate}`,
    html: `
      <p>Dear ${inspectorName},</p>
      <p>Please find attached the property inspection report for <strong>${propertyName}</strong> (${propertyRef}), carried out on ${inspectionDate}.</p>
      <p>This report was generated automatically by the ASH Inspection App.</p>
      <br />
      <p>ASH Chartered Surveyors</p>
    `,
    attachments: [
      // DOCX — for internal editing
      {
        filename: `${filename}.docx`,
        content:  docxBuffer.toString('base64'),
      },
      // PDF — client-ready copy, only attached if LibreOffice conversion succeeded
      ...(pdfBuffer ? [{
        filename: `${filename}.pdf`,
        content:  pdfBuffer.toString('base64'),
      }] : []),
    ],
  })

  if (error) {
    console.error('[EMAIL] Resend error:', error)
    throw new Error(`Email send failed: ${JSON.stringify(error)}`)
  }

  console.log(`[EMAIL] Report sent successfully to ${recipient}`)
}
