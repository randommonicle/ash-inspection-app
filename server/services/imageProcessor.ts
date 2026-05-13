import sharp from 'sharp'

export interface ResizedImage {
  buffer: Buffer
  width:  number
  height: number
}

// Resize a photo to keep it under both Anthropic vision's 5 MB base64 limit
// and Resend's 40 MB total-attachment limit. A typical 6 MB phone photo comes
// out around 400–800 KB. Re-encodes as JPEG and honours EXIF rotation so
// portrait shots render correctly in the DOCX.
//
// Returns the final width/height so the report generator can render each photo
// at its actual aspect ratio rather than forcing a 4:3 box.
export async function resizeForReport(input: Buffer): Promise<ResizedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  return { buffer: data, width: info.width, height: info.height }
}
