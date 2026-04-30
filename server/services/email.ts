import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ReportEmailParams {
  to: string
  inspectorName: string
  propertyName: string
  propertyRef: string
  inspectionDate: string
  docxBuffer: Buffer
  filename: string
}

export async function sendReportEmail(params: ReportEmailParams): Promise<void> {
  const { to, inspectorName, propertyName, propertyRef, inspectionDate, docxBuffer, filename } = params

  // REPORT_TO_OVERRIDE routes all reports to a fixed address during development.
  // Remove this env var when per-inspector email routing is ready for production.
  const recipient = process.env.REPORT_TO_OVERRIDE ?? to
  console.log(`[EMAIL] Sending report to ${recipient} for ${propertyRef} — ${propertyName}`)

  const { error } = await resend.emails.send({
    from:    'ASH Inspection Reports <onboarding@resend.dev>',
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
      {
        filename,
        content: docxBuffer.toString('base64'),
      },
    ],
  })

  if (error) {
    console.error('[EMAIL] Resend error:', error)
    throw new Error(`Email send failed: ${JSON.stringify(error)}`)
  }

  console.log(`[EMAIL] Report sent successfully to ${recipient}`)
}
