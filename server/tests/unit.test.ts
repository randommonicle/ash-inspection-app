/**
 * Unit tests — zero network calls, zero mocks.
 *
 * These run in ~1 second and should be run before every commit.
 * They catch the class of bug we already hit once: a section key present in
 * one constant but missing from another, which caused blank headings in the
 * Word report. If a test fails here, fix the source — never skip the test.
 *
 * Run: npm run test:unit
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { SECTION_LABELS, SECTION_ORDER, buildReportDocx, type ReportData } from '../services/reportGenerator'
import { buildReportHtml } from '../services/htmlReportGenerator'
import type { SectionKey } from '../services/anthropic'

// ── The canonical list of valid section keys ──────────────────────────────────
// This mirrors the SectionKey union type in services/anthropic.ts.
// If you add a new section you MUST add it here too — the test will fail and
// remind you to also update SECTION_LABELS and SECTION_ORDER.
const VALID_SECTION_KEYS: SectionKey[] = [
  'external_approach', 'grounds', 'bin_store', 'car_park',
  'external_fabric', 'roof', 'communal_entrance', 'stairwells',
  'lifts', 'plant_room', 'meter_reads', 'internal_communal', 'additional',
]

// ── Section constant integrity ────────────────────────────────────────────────
describe('SECTION_ORDER', () => {
  test('contains every valid section key', () => {
    for (const key of VALID_SECTION_KEYS) {
      assert.ok(
        SECTION_ORDER.includes(key),
        `Missing from SECTION_ORDER: '${key}'`,
      )
    }
  })

  test('has no extra keys not in the canonical list', () => {
    for (const key of SECTION_ORDER) {
      assert.ok(
        (VALID_SECTION_KEYS as string[]).includes(key),
        `Unknown key in SECTION_ORDER: '${key}' — add it to VALID_SECTION_KEYS in the test too`,
      )
    }
  })

  test('has no duplicates', () => {
    const seen = new Set<string>()
    for (const key of SECTION_ORDER) {
      assert.ok(!seen.has(key), `Duplicate in SECTION_ORDER: '${key}'`)
      seen.add(key)
    }
  })

  test('meter_reads is present (regression: was missing from reportGenerator)', () => {
    assert.ok(SECTION_ORDER.includes('meter_reads'), 'meter_reads must be in SECTION_ORDER')
  })
})

describe('SECTION_LABELS', () => {
  test('has a label for every key in SECTION_ORDER', () => {
    for (const key of SECTION_ORDER) {
      const label = SECTION_LABELS[key]
      assert.ok(label, `Missing label for section '${key}'`)
      assert.ok(label.trim().length > 0, `Blank label for section '${key}'`)
    }
  })

  test('meter_reads has a non-blank label (regression)', () => {
    assert.ok(SECTION_LABELS['meter_reads'], 'meter_reads must have a label in SECTION_LABELS')
    assert.ok(SECTION_LABELS['meter_reads'].length > 0)
  })

  test('no section key has a label that contains the raw key (would indicate a copy-paste placeholder)', () => {
    for (const key of SECTION_ORDER) {
      assert.notEqual(
        SECTION_LABELS[key], key,
        `Section '${key}' label is just the raw key — replace it with a proper human-readable label`,
      )
    }
  })
})

// ── DOCX build smoke test ─────────────────────────────────────────────────────
// Calls buildReportDocx() with minimal synthetic data.
// Verifies:
//   1. It doesn't throw
//   2. Returns a Buffer starting with the ZIP magic bytes (PK = 0x50 0x4B)
//   3. Output is large enough to be a real document (> 5 KB)
//
// Does NOT assert exact content — that would be fragile. If this fails,
// something in the DOCX builder is broken at a structural level.

describe('buildReportDocx', () => {
  const SYNTHETIC_DATA: ReportData = {
    propertyName:      'Test Block',
    propertyRef:       'TEST-001',
    propertyAddress:   '1 Test Street, Cheltenham GL50 1AA',
    propertyUnits:     12,
    managementCompany: 'ASH Test Ltd',
    propertyFlags: {
      has_car_park:    false,
      has_lift:        false,
      has_roof_access: false,
    },
    inspectionDate:     '8 May 2026',
    startTime:          '09:00',
    endTime:            '10:30',
    weather:            'Overcast, dry',
    nextInspection:     null,
    inspectorName:      'Test Inspector',
    inspectorTitle:     'Chartered Surveyor',
    inspectorEmail:     'test@ashproperty.co.uk',
    overallSummary:     'The property is in good general condition with minor maintenance items noted.',
    reportGeneratedAt:  new Date().toISOString(),
    recurringItems:     [],
    photos:             [],
    observations: [
      {
        id:             'obs-001',
        section_key:    'external_approach',
        template_order: 1,
        processed_text: 'The pathway is in good condition with no significant defects noted.',
        action_text:    null,
        risk_level:     null,
      },
      {
        id:             'obs-002',
        section_key:    'meter_reads',
        template_order: 11,
        processed_text: 'Gas meter reading: 12345. Electric meter reading: 67890.',
        action_text:    null,
        risk_level:     null,
      },
    ],
  }

  test('generates a valid ZIP buffer without throwing', async () => {
    const buffer = await buildReportDocx(SYNTHETIC_DATA)
    assert.ok(buffer instanceof Buffer, 'Expected a Buffer')
    // ZIP files start with PK (0x50 0x4B)
    assert.strictEqual(buffer[0], 0x50, 'First byte should be 0x50 (P)')
    assert.strictEqual(buffer[1], 0x4B, 'Second byte should be 0x4B (K)')
  })

  test('generated DOCX is larger than 5 KB (not an empty/stub file)', async () => {
    const buffer = await buildReportDocx(SYNTHETIC_DATA)
    assert.ok(
      buffer.byteLength > 5_000,
      `DOCX is suspiciously small: ${buffer.byteLength} bytes. Expected > 5 000.`,
    )
  })

  test('generates without throwing when all optional flags are true', async () => {
    const data: ReportData = {
      ...SYNTHETIC_DATA,
      propertyFlags: { has_car_park: true, has_lift: true, has_roof_access: true },
      observations: [
        ...SYNTHETIC_DATA.observations,
        { id: 'obs-003', section_key: 'car_park',  template_order: 4,  processed_text: 'Car park in good order.', action_text: null, risk_level: null },
        { id: 'obs-004', section_key: 'lifts',     template_order: 9,  processed_text: 'Lift operating normally.', action_text: null, risk_level: null },
        { id: 'obs-005', section_key: 'roof',      template_order: 6,  processed_text: 'Roof appears sound.',     action_text: null, risk_level: null },
      ],
    }
    const buffer = await buildReportDocx(data)
    assert.ok(buffer instanceof Buffer)
    assert.ok(buffer.byteLength > 5_000)
  })

  test('generates without throwing when observations have risk levels', async () => {
    const data: ReportData = {
      ...SYNTHETIC_DATA,
      observations: [
        {
          id: 'obs-high', section_key: 'external_fabric', template_order: 5,
          processed_text: 'Significant spalling to concrete render on south elevation.',
          action_text: 'Instruct scaffold and carry out full repair to render.',
          risk_level: 'High',
        },
        {
          id: 'obs-med', section_key: 'stairwells', template_order: 8,
          processed_text: 'Stairwell handrail loose at first floor level.',
          action_text: 'Tighten handrail fixings.',
          risk_level: 'Medium',
        },
      ],
    }
    const buffer = await buildReportDocx(data)
    assert.ok(buffer instanceof Buffer)
    assert.ok(buffer.byteLength > 5_000)
  })
})

// ── HTML twin smoke tests ────────────────────────────────────────────────────
// The HTML renderer must consume the same ReportData and produce a complete
// self-contained document. We assert structural invariants rather than exact
// markup — the styling will evolve, but the document must always be valid
// HTML, escape user input, and reference every visible section.

describe('buildReportHtml', () => {
  const BASE_DATA: ReportData = {
    propertyName:      'Test Block',
    propertyRef:       'TEST-001',
    propertyAddress:   '1 Test Street, Cheltenham GL50 1AA',
    propertyUnits:     12,
    managementCompany: 'ASH Test Ltd',
    propertyFlags: { has_car_park: false, has_lift: false, has_roof_access: false },
    inspectionDate:    '8 May 2026',
    startTime:         '09:00',
    endTime:           '10:30',
    weather:           'Overcast, dry',
    nextInspection:    '8 June 2026 (projected)',
    inspectorName:     'Test Inspector',
    inspectorTitle:    'Chartered Surveyor',
    inspectorEmail:    'test@ashproperty.co.uk',
    overallSummary:    'The property is in good general condition.',
    reportGeneratedAt: new Date().toISOString(),
    recurringItems:    [],
    photos:            [],
    observations: [
      {
        id: 'obs-001', section_key: 'external_approach', template_order: 1,
        processed_text: 'The pathway is in good condition.',
        action_text: null, risk_level: null,
      },
    ],
  }

  test('produces a non-empty Buffer that begins with the HTML doctype', () => {
    const buffer = buildReportHtml(BASE_DATA)
    assert.ok(buffer instanceof Buffer)
    assert.ok(buffer.byteLength > 1_000)
    assert.ok(buffer.toString('utf-8').startsWith('<!DOCTYPE html>'))
  })

  test('escapes HTML-special characters in user-controlled fields', () => {
    const html = buildReportHtml({
      ...BASE_DATA,
      propertyName:   'Block <script>alert(1)</script>',
      overallSummary: 'Issue with "quotes" & ampersands.',
      observations: [{
        ...BASE_DATA.observations[0],
        processed_text: 'Tag: <b>bold</b>',
      }],
    }).toString('utf-8')
    assert.ok(!html.includes('<script>alert(1)</script>'), 'Raw <script> tag leaked into output')
    assert.ok(html.includes('&lt;script&gt;'),  'Property name was not HTML-escaped')
    assert.ok(html.includes('&quot;quotes&quot;'), 'Double quotes were not escaped')
    assert.ok(html.includes('&amp; ampersands'),   'Ampersand was not escaped')
    assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt;'), 'Observation text was not escaped')
  })

  test('renders recurring items table only when items exist', () => {
    const withoutRecurring = buildReportHtml(BASE_DATA).toString('utf-8')
    assert.ok(!withoutRecurring.includes('Recurring Items'))

    const withRecurring = buildReportHtml({
      ...BASE_DATA,
      recurringItems: [{
        section_key:  'stairwells',
        issue:        'Loose handrail still present.',
        previousDate: '8 April 2026',
      }],
    }).toString('utf-8')
    assert.ok(withRecurring.includes('Recurring Items'))
    assert.ok(withRecurring.includes('Loose handrail still present.'))
  })

  test('omits sections gated by a false property flag', () => {
    const html = buildReportHtml({
      ...BASE_DATA,
      propertyFlags: { has_car_park: false, has_lift: false, has_roof_access: false },
      observations: [
        { id: 'a', section_key: 'car_park', template_order: 4, processed_text: 'Should not appear', action_text: null, risk_level: null },
        { id: 'b', section_key: 'lifts',    template_order: 9, processed_text: 'Should not appear', action_text: null, risk_level: null },
      ],
    }).toString('utf-8')
    assert.ok(!html.includes('Should not appear'), 'Gated-section observation text leaked through')
  })

  test('inlines photos as base64 data URIs and emits a lightbox per photo', () => {
    const oneByOneJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46])
    const html = buildReportHtml({
      ...BASE_DATA,
      photos: [{
        id: 'p1',
        observation_id: 'obs-001',
        caption: 'Front entrance',
        opus_description: null,
        imageBuffer: oneByOneJpeg,
        imageWidth:  null,
        imageHeight: null,
      }],
    }).toString('utf-8')
    assert.ok(html.includes('data:image/jpeg;base64,'), 'Photo was not inlined as a data URI')
    assert.ok(html.includes('id="photo-p1"'),           'Lightbox anchor missing for photo')
    assert.ok(html.includes('href="#photo-p1"'),        'Thumb does not link to its lightbox')
  })
})
