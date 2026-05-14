import sharp from 'sharp'

export interface ResizedImage {
  buffer: Buffer
  width:  number
  height: number
}

export interface ResizeOptions {
  maxEdge?: number  // longest-edge cap in px (default 2048)
  quality?: number  // JPEG quality 1–100 (default 82)
}

// Resize a photo to keep it under both Anthropic vision's 5 MB base64 limit
// and Resend's 40 MB total-attachment limit. A typical 6 MB phone photo comes
// out around 400–800 KB at the defaults. Re-encodes as JPEG and honours EXIF
// rotation so portrait shots render correctly in the DOCX.
//
// maxEdge/quality are tunable so the report pipeline can compress harder on
// photo-heavy inspections (see resizeTier in generateReport.ts) — keeping the
// emailed report under Resend's cap without losing any photos.
//
// Returns the final width/height so the report generator can render each photo
// at its actual aspect ratio rather than forcing a 4:3 box.
export async function resizeForReport(input: Buffer, opts: ResizeOptions = {}): Promise<ResizedImage> {
  const maxEdge = opts.maxEdge ?? 2048
  const quality = opts.quality ?? 82

  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  return { buffer: data, width: info.width, height: info.height }
}
