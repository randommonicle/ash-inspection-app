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

  // TODO [PRODUCTION]: Remove REPORT_TO_OVERRIDE from server/.env entirely.
  // With it set, ALL reports go to one address regardless of who's logged in.
  // Without it, each report goes to the inspector's own email (the correct behaviour).
  const recipient = process.env.REPORT_TO_OVERRIDE ?? to
  console.log(`[EMAIL] Sending report to ${recipient} for ${propertyRef} — ${propertyName}`)

  const { error } = await resend.emails.send({
    // TODO [PRODUCTION]: Replace with a verified ashproperty.co.uk sender once the
    // domain is verified in the Resend dashboard (resend.com → Domains → Add Domain).
    // e.g. 'ASH Inspection Reports <reports@ashproperty.co.uk>'
    // The onboarding@resend.dev address only works while REPORT_TO_OVERRIDE is set
    // (Resend free tier restricts unverified senders to your own confirmed email).
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
