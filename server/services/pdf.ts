import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

// On Linux (Railway), soffice is on PATH via apt. On Windows (local dev),
// use the full install path. Falls back gracefully if LibreOffice is absent.
const SOFFICE_PATH = process.platform === 'win32'
  ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
  : 'soffice'

/**
 * Converts a DOCX buffer to PDF using LibreOffice headless mode.
 * Returns the PDF as a Buffer, or null if LibreOffice is not available.
 */
export async function convertDocxToPdf(docxBuffer: Buffer, baseName: string): Promise<Buffer | null> {
  const tmpDocx = join(tmpdir(), `${baseName}.docx`)
  const tmpPdf  = join(tmpdir(), `${baseName}.pdf`)

  try {
    // Write DOCX to a temp file
    await writeFile(tmpDocx, docxBuffer)

    // Run LibreOffice headless conversion
    await execFileAsync(SOFFICE_PATH, [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', tmpdir(),
      tmpDocx,
    ])

    // Read resulting PDF back into a buffer
    const pdfBuffer = await readFile(tmpPdf)
    console.log(`[PDF] Converted to PDF — ${pdfBuffer.byteLength} bytes`)
    return pdfBuffer

  } catch (err) {
    console.warn('[PDF] LibreOffice conversion failed (will send DOCX only):', err instanceof Error ? err.message : err)
    return null

  } finally {
    // Clean up temp files regardless of success or failure
    await unlink(tmpDocx).catch(() => {})
    await unlink(tmpPdf).catch(() => {})
  }
}
