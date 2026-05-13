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
  pdfBuffer?: Buffer | null  // optional — attached if provided
  htmlBuffer?: Buffer | null // optional self-contained HTML report (click-to-enlarge via inline lightbox)
}

export async function sendReportEmail(params: ReportEmailParams): Promise<void> {
  const { to, inspectorName, propertyName, propertyRef, inspectionDate, docxBuffer, filename, pdfBuffer, htmlBuffer } = params

  console.log(`[EMAIL] Sending report to ${to} for ${propertyRef} — ${propertyName}`)

  const { error } = await resend.emails.send({
    from:    'ASH Property App <reports@propertyappdev.co.uk>',
    to:      to,
    subject: `Inspection Report — ${propertyName} (${propertyRef}) — ${inspectionDate}`,
    html: `
      <p>Dear ${inspectorName},</p>
      <p>Please find attached the property inspection report for <strong>${propertyName}</strong> (${propertyRef}), carried out on ${inspectionDate}.</p>
      ${htmlBuffer ? `<p style="color:#555;font-size:13px;">The HTML copy is interactive — tap any photo to enlarge. Download it from this email to view, as most email clients won't preview HTML attachments for security reasons.</p>` : ''}
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
      // HTML — self-contained, click-to-enlarge photos, opens in any browser.
      // Suffix "_INTERACTIVE" so it stands out from the docx/pdf in the
      // attachment list and the recipient is more likely to download it.
      ...(htmlBuffer ? [{
        filename: `${filename}_INTERACTIVE.html`,
        content:  htmlBuffer.toString('base64'),
      }] : []),
    ],
  })

  if (error) {
    console.error('[EMAIL] Resend error:', error)
    throw new Error(`Email send failed: ${JSON.stringify(error)}`)
  }

  console.log(`[EMAIL] Report sent successfully to ${to}`)
}
