// Self-contained HTML report renderer. Mirrors the DOCX layout from
// reportGenerator.ts but produces a single .html file with all photos inlined
// as base64 data URIs. The file is fully portable — no Supabase signed URLs,
// no external CDN dependencies for images — so it remains usable years after
// service-key rotation or any back-end change.
//
// Click-to-enlarge is handled with a pure CSS :target lightbox so the file
// works in any browser (including locked-down corporate environments) without
// JavaScript. Google Fonts are imported with safe fallbacks for offline use.
//
// IMPORTANT: every layout change here must be mirrored in reportGenerator.ts
// (or vice versa) — the DOCX and HTML are two renderings of the same report.

import type { ReportData, ReportObservation, ReportPhoto } from './reportGenerator'
import { SECTION_LABELS, SECTION_ORDER } from './reportGenerator'

const C = {
  navy:      '#1F3864',
  midBlue:   '#2E5395',
  lightBlue: '#D6E4F0',
  red:       '#C00000',
  amber:     '#E26B0A',
  green:     '#375623',
  lightGrey: '#F2F2F2',
  midGrey:   '#D9D9D9',
  darkText:  '#222222',
  labelText: '#555555',
  caption:   '#888888',
}

const RISK_TIMEFRAMES: Record<string, string> = {
  High:   'Within 5 working days',
  Medium: 'Within 30 days',
  Low:    'Within 90 days',
}

const RISK_COLOURS: Record<string, string> = {
  High:   C.red,
  Medium: C.amber,
  Low:    C.green,
}

// HTML-escape user-controlled text. Used everywhere observation text, captions,
// or property names flow into the document. Avoids accidental tag injection
// from voice transcripts that contain stray angle brackets or ampersands.
function esc(input: string | null | undefined): string {
  if (input == null) return ''
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function photoDataUri(photo: ReportPhoto): string | null {
  if (!photo.imageBuffer) return null
  return `data:image/jpeg;base64,${photo.imageBuffer.toString('base64')}`
}

function isSectionApplicable(sectionKey: string, flags: ReportData['propertyFlags']): boolean {
  if (sectionKey === 'car_park' && !flags.has_car_park) return false
  if (sectionKey === 'lifts'    && !flags.has_lift)     return false
  if (sectionKey === 'roof'     && !flags.has_roof_access) return false
  return true
}

function renderRecurringTable(items: ReportData['recurringItems']): string {
  if (items.length === 0) return ''
  const rows = items.map(item => `
    <tr>
      <td class="cell-label">${esc(SECTION_LABELS[item.section_key] ?? item.section_key)}</td>
      <td>${esc(item.issue)}</td>
      <td class="cell-date">${esc(item.previousDate)}</td>
    </tr>
  `).join('')
  return `
    <section class="recurring">
      <h2>Recurring Items</h2>
      <p class="recurring-note">Items flagged in the previous inspection that appear to remain outstanding.</p>
      <table>
        <thead>
          <tr><th>Section</th><th>Outstanding issue</th><th>First raised</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `
}

function renderObservationBlock(obs: ReportObservation): string {
  const action = obs.action_text
    ? `
      <div class="action">
        <div class="action-head">
          <span class="action-label">Action required</span>
          ${obs.risk_level
            ? `<span class="risk-badge" style="background:${RISK_COLOURS[obs.risk_level]}">${esc(obs.risk_level)} — ${esc(RISK_TIMEFRAMES[obs.risk_level])}</span>`
            : ''}
        </div>
        <p>${esc(obs.action_text)}</p>
      </div>
    `
    : ''
  return `
    <div class="observation">
      <p>${esc(obs.processed_text)}</p>
      ${action}
    </div>
  `
}

function renderSection(
  sectionKey: string,
  observations: ReportObservation[],
  photos: ReportPhoto[],
): string {
  const sectionObs    = observations.filter(o => o.section_key === sectionKey)
  const sectionPhotos = photos.filter(p =>
    sectionObs.some(o => o.id === p.observation_id) ||
    p.opus_description?.section_key === sectionKey
  )
  if (sectionObs.length === 0 && sectionPhotos.length === 0) return ''

  const photoStrip = sectionPhotos.length > 0
    ? `
      <div class="photo-strip">
        ${sectionPhotos.map(p => {
          const uri = photoDataUri(p)
          if (!uri) return ''
          const caption = p.caption ?? p.opus_description?.suggested_caption ?? ''
          return `
            <a class="photo-thumb" href="#photo-${esc(p.id)}">
              <img src="${uri}" alt="${esc(caption || 'Inspection photo')}" loading="lazy" />
              ${caption ? `<span class="photo-caption">${esc(caption)}</span>` : ''}
            </a>
          `
        }).join('')}
      </div>
    `
    : ''

  return `
    <section class="report-section" id="section-${esc(sectionKey)}">
      <h2>${esc(SECTION_LABELS[sectionKey] ?? sectionKey)}</h2>
      ${sectionObs.map(renderObservationBlock).join('')}
      ${photoStrip}
    </section>
  `
}

function renderPhotoAppendix(photos: ReportPhoto[]): string {
  const withImages = photos.filter(p => p.imageBuffer)
  if (withImages.length === 0) return ''

  // Group by section using the same logic as the body: photos linked to an
  // observation inherit that observation's section; unlinked photos use their
  // Opus-suggested section_key; everything else goes under "additional".
  const grouped = new Map<string, ReportPhoto[]>()
  for (const photo of withImages) {
    const key = photo.opus_description?.section_key ?? 'additional'
    const arr = grouped.get(key) ?? []
    arr.push(photo)
    grouped.set(key, arr)
  }

  const sections = SECTION_ORDER
    .filter(key => grouped.has(key))
    .map(key => {
      const sectionPhotos = grouped.get(key)!
      const tiles = sectionPhotos.map(p => {
        const uri = photoDataUri(p)
        if (!uri) return ''
        const caption = p.caption ?? p.opus_description?.suggested_caption ?? ''
        return `
          <a class="appendix-tile" href="#photo-${esc(p.id)}">
            <img src="${uri}" alt="${esc(caption || 'Inspection photo')}" loading="lazy" />
            ${caption ? `<span class="appendix-caption">${esc(caption)}</span>` : ''}
          </a>
        `
      }).join('')
      return `
        <div class="appendix-section">
          <h3>${esc(SECTION_LABELS[key] ?? key)}</h3>
          <div class="appendix-grid">${tiles}</div>
        </div>
      `
    })
    .join('')

  return `
    <section class="appendix">
      <h2>Photo Appendix</h2>
      ${sections}
    </section>
  `
}

function renderLightboxes(photos: ReportPhoto[]): string {
  // Pure-CSS lightbox: each photo gets a hidden full-screen overlay that
  // shows when its #photo-{id} fragment becomes the URL :target. Closing the
  // overlay is a link back to # (no scripting required).
  return photos
    .filter(p => p.imageBuffer)
    .map(p => {
      const uri = photoDataUri(p)
      if (!uri) return ''
      const caption = p.caption ?? p.opus_description?.suggested_caption ?? ''
      return `
        <div class="lightbox" id="photo-${esc(p.id)}">
          <a class="lightbox-close" href="#" aria-label="Close">&times;</a>
          <img src="${uri}" alt="${esc(caption || 'Inspection photo')}" />
          ${caption ? `<p class="lightbox-caption">${esc(caption)}</p>` : ''}
        </div>
      `
    })
    .join('')
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap');

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
  color: ${C.darkText};
  background: #f5f6f8;
  line-height: 1.5;
  font-size: 14px;
}
.page {
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 40px 64px;
  background: #fff;
  min-height: 100vh;
}

/* ── Header ── */
.firm-header {
  border-bottom: 2px solid ${C.navy};
  padding-bottom: 12px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}
.firm-name {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 18px;
  font-weight: 700;
  color: ${C.navy};
  letter-spacing: 0.5px;
  margin: 0;
}
.firm-meta {
  font-size: 11px;
  color: ${C.labelText};
  margin: 2px 0 0;
}
.report-kind {
  font-size: 14px;
  font-weight: 600;
  color: ${C.midBlue};
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* ── Cover block ── */
.cover h1 {
  font-family: 'Source Serif 4', Georgia, serif;
  color: ${C.navy};
  font-size: 28px;
  margin: 0 0 4px;
}
.cover .ref-badge {
  display: inline-block;
  background: ${C.lightBlue};
  color: ${C.navy};
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Inter', monospace;
}
.cover-meta {
  margin: 16px 0 24px;
  border: 1px solid ${C.midGrey};
  border-radius: 6px;
  overflow: hidden;
}
.cover-meta table {
  width: 100%;
  border-collapse: collapse;
}
.cover-meta td {
  padding: 8px 12px;
  font-size: 13px;
  border-bottom: 1px solid ${C.lightGrey};
}
.cover-meta tr:last-child td { border-bottom: 0; }
.cover-meta td.label {
  font-weight: 600;
  color: ${C.labelText};
  width: 38%;
  background: ${C.lightGrey};
}

/* ── Summary box ── */
.summary {
  background: ${C.lightBlue};
  border-left: 4px solid ${C.navy};
  padding: 16px 20px;
  margin: 24px 0;
  border-radius: 4px;
}
.summary h2 {
  margin: 0 0 8px;
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 16px;
  color: ${C.navy};
}
.summary p { margin: 0; font-size: 13px; }

/* ── Recurring items ── */
.recurring { margin: 32px 0; }
.recurring h2 {
  font-family: 'Source Serif 4', Georgia, serif;
  color: ${C.navy};
  font-size: 18px;
  margin: 0 0 4px;
}
.recurring-note {
  font-size: 12px;
  color: ${C.labelText};
  margin: 0 0 12px;
}
.recurring table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.recurring th, .recurring td {
  text-align: left;
  padding: 8px 10px;
  border: 1px solid ${C.midGrey};
}
.recurring th {
  background: ${C.navy};
  color: #fff;
  font-weight: 600;
}
.recurring .cell-label { font-weight: 600; color: ${C.navy}; width: 26%; }
.recurring .cell-date  { width: 18%; color: ${C.labelText}; font-size: 12px; }

/* ── Sections ── */
.report-section {
  margin: 32px 0;
  page-break-inside: avoid;
}
.report-section h2 {
  font-family: 'Source Serif 4', Georgia, serif;
  color: ${C.navy};
  font-size: 18px;
  margin: 0 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid ${C.lightBlue};
}
.observation { margin: 0 0 16px; }
.observation > p {
  margin: 0 0 8px;
  font-size: 13px;
}
.action {
  background: #fafbfd;
  border: 1px solid ${C.lightBlue};
  border-radius: 4px;
  padding: 10px 14px;
  margin-top: 8px;
}
.action-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.action-label {
  font-weight: 600;
  font-size: 11px;
  color: ${C.navy};
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.risk-badge {
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.action p { margin: 0; font-size: 13px; }

/* ── In-section photo strip ── */
.photo-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.photo-thumb {
  display: block;
  text-decoration: none;
  color: inherit;
}
.photo-thumb img {
  width: 100%;
  aspect-ratio: auto;
  display: block;
  border-radius: 4px;
  border: 1px solid ${C.midGrey};
  cursor: zoom-in;
}
.photo-caption {
  display: block;
  font-size: 11px;
  color: ${C.caption};
  margin-top: 4px;
  line-height: 1.3;
}

/* ── Photo appendix ── */
.appendix { margin: 48px 0 0; page-break-before: always; }
.appendix > h2 {
  font-family: 'Source Serif 4', Georgia, serif;
  color: ${C.navy};
  font-size: 20px;
  margin: 0 0 16px;
}
.appendix-section { margin: 0 0 24px; }
.appendix-section h3 {
  font-family: 'Source Serif 4', Georgia, serif;
  color: ${C.navy};
  font-size: 14px;
  margin: 0 0 8px;
}
.appendix-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.appendix-tile { display: block; text-decoration: none; color: inherit; }
.appendix-tile img {
  width: 100%;
  display: block;
  border-radius: 4px;
  border: 1px solid ${C.midGrey};
  cursor: zoom-in;
}
.appendix-caption {
  display: block;
  font-size: 10px;
  color: ${C.caption};
  margin-top: 3px;
  line-height: 1.25;
}

/* ── Lightbox (pure CSS via :target) ── */
.lightbox {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.92);
  z-index: 1000;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.lightbox:target { display: flex; }
.lightbox img {
  max-width: 100%;
  max-height: calc(100vh - 80px);
  object-fit: contain;
  border-radius: 4px;
}
.lightbox-caption {
  color: #ddd;
  margin: 12px 0 0;
  font-size: 13px;
  text-align: center;
  max-width: 600px;
}
.lightbox-close {
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 36px;
  color: #fff;
  text-decoration: none;
  line-height: 1;
}

/* ── Footer ── */
.report-footer {
  border-top: 1px solid ${C.lightBlue};
  margin-top: 48px;
  padding-top: 16px;
  font-size: 11px;
  color: ${C.labelText};
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

/* ── Print ── */
@media print {
  body { background: #fff; }
  .page { padding: 12mm; max-width: none; }
  .lightbox, .lightbox-close { display: none !important; }
  .photo-thumb img, .appendix-tile img { cursor: default; }
  .report-section { page-break-inside: avoid; }
  .appendix { page-break-before: always; }
  a { color: inherit; text-decoration: none; }
}
`

export function buildReportHtml(data: ReportData): Buffer {
  const applicable = SECTION_ORDER.filter(key => isSectionApplicable(key, data.propertyFlags))
  const sectionsHtml = applicable.map(key => renderSection(key, data.observations, data.photos)).join('')

  const flagsBadges = [
    data.propertyFlags.has_car_park    && 'Car park',
    data.propertyFlags.has_lift        && 'Lift',
    data.propertyFlags.has_roof_access && 'Roof access',
  ].filter(Boolean).join(' · ') || '—'

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Inspection Report — ${esc(data.propertyName)} (${esc(data.propertyRef)}) — ${esc(data.inspectionDate)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="page">
  <header class="firm-header">
    <div>
      <p class="firm-name">ASH CHARTERED SURVEYORS</p>
      <p class="firm-meta">1-5 Kew Place, Cheltenham GL53 7NQ &middot; T: 01242 237274 &middot; ${esc(data.inspectorEmail)} &middot; ashproperty.co.uk</p>
    </div>
    <div class="report-kind">Property Inspection Report</div>
  </header>

  <section class="cover">
    <span class="ref-badge">${esc(data.propertyRef)}</span>
    <h1>${esc(data.propertyName)}</h1>
    <p class="firm-meta">${esc(data.propertyAddress)}</p>

    <div class="cover-meta">
      <table>
        <tr><td class="label">Inspection date</td><td>${esc(data.inspectionDate)}</td></tr>
        <tr><td class="label">Time on site</td><td>${esc(data.startTime)}${data.endTime ? ` – ${esc(data.endTime)}` : ''}</td></tr>
        <tr><td class="label">Weather</td><td>${esc(data.weather ?? '—')}</td></tr>
        <tr><td class="label">Inspector</td><td>${esc(data.inspectorName)} (${esc(data.inspectorTitle)})</td></tr>
        <tr><td class="label">Management company</td><td>${esc(data.managementCompany)}</td></tr>
        <tr><td class="label">Units</td><td>${data.propertyUnits}</td></tr>
        <tr><td class="label">Facilities</td><td>${flagsBadges}</td></tr>
        <tr><td class="label">Next inspection</td><td>${esc(data.nextInspection ?? '—')}</td></tr>
      </table>
    </div>
  </section>

  <section class="summary">
    <h2>Overall Condition Summary</h2>
    <p>${esc(data.overallSummary)}</p>
  </section>

  ${renderRecurringTable(data.recurringItems)}

  ${sectionsHtml}

  ${renderPhotoAppendix(data.photos)}

  <footer class="report-footer">
    <span>Report generated ${esc(data.reportGeneratedAt)}</span>
    <span>ASH Chartered Surveyors &middot; ashproperty.co.uk</span>
  </footer>
</main>

${renderLightboxes(data.photos)}
</body>
</html>`

  return Buffer.from(html, 'utf-8')
}
