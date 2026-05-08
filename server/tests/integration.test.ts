/**
 * Integration tests — real Anthropic API calls, real network.
 *
 * COST: ~$0.0002 per run (Claude Haiku at ~500 tokens per call × 4 calls).
 * Run these before deploying to Railway, not on every commit.
 *
 * IMPORTANT: These tests do NOT mock the AI. If the API returns unexpected
 * JSON the test fails and you fix the parsing code — not the test.
 * Never add `// @ts-expect-error` or try/catch to hide failures here.
 *
 * Requires: ANTHROPIC_API_KEY in server/.env
 * Run: npm run test:integration
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { classifyNarration } from '../services/anthropic'
import type { SectionKey } from '../services/anthropic'

// All valid section keys — test asserts the API never returns something outside this set.
const VALID_SECTION_KEYS: ReadonlySet<SectionKey> = new Set([
  'external_approach', 'grounds', 'bin_store', 'car_park',
  'external_fabric', 'roof', 'communal_entrance', 'stairwells',
  'lifts', 'plant_room', 'meter_reads', 'internal_communal', 'additional',
])

/**
 * Assert that a ClassifyResult has a valid shape.
 * Throws if anything is malformed — this is a real schema check, not a type hint.
 */
function assertValidClassifyResult(result: Awaited<ReturnType<typeof classifyNarration>>, label: string) {
  assert.ok(result, `${label}: result is null/undefined`)
  assert.ok(
    VALID_SECTION_KEYS.has(result.section_key),
    `${label}: section_key '${result.section_key}' is not a known section. ` +
    `Valid values: ${[...VALID_SECTION_KEYS].join(', ')}`,
  )
  assert.ok(
    ['high', 'medium', 'low'].includes(result.confidence),
    `${label}: confidence '${result.confidence}' must be 'high', 'medium', or 'low'`,
  )
  assert.strictEqual(
    typeof result.split_required, 'boolean',
    `${label}: split_required must be a boolean, got ${typeof result.split_required}`,
  )
  if (result.split_required) {
    assert.ok(
      result.split_at === null || typeof result.split_at === 'number',
      `${label}: when split_required is true, split_at must be a number or null`,
    )
  }
}

describe('classifyNarration — real Anthropic API', () => {
  // Timeout generous enough for cold API response (Haiku is fast but network varies)
  const TIMEOUT_MS = 30_000

  test('classifies a clear external-approach narration', { timeout: TIMEOUT_MS }, async () => {
    const result = await classifyNarration(
      'The pathway leading to the main entrance has some cracked paving slabs and the gate latch is stiff.',
    )
    assertValidClassifyResult(result, 'external approach narration')
    // This is unambiguously external_approach or grounds — test the shape, not the exact key.
    // If the classifier gets this completely wrong (e.g. returns 'lifts') flag it as a prompt issue.
    const plausible: SectionKey[] = ['external_approach', 'grounds']
    assert.ok(
      plausible.includes(result.section_key),
      `Expected external approach to classify as one of [${plausible.join(', ')}], got '${result.section_key}'.\n` +
      `This may indicate a prompt quality issue — review the classifier prompt.`,
    )
  })

  test('classifies a clear meter-reads narration', { timeout: TIMEOUT_MS }, async () => {
    const result = await classifyNarration(
      'Gas meter reading is 45231, electricity meter reading is 12089, water meter reads 3401.',
    )
    assertValidClassifyResult(result, 'meter reads narration')
    assert.strictEqual(
      result.section_key, 'meter_reads',
      `Expected meter_reads but got '${result.section_key}'. ` +
      `Check the classifier prompt includes meter_reads as a valid section.`,
    )
  })

  test('classifies a lift narration correctly', { timeout: TIMEOUT_MS }, async () => {
    const result = await classifyNarration(
      'The passenger lift is operational, last serviced March 2026. The door seals are worn and the interior lighting is dim.',
    )
    assertValidClassifyResult(result, 'lift narration')
    assert.strictEqual(
      result.section_key, 'lifts',
      `Expected lifts but got '${result.section_key}'.`,
    )
  })

  test('handles a clearly multi-section narration without crashing', { timeout: TIMEOUT_MS }, async () => {
    // Deliberately spans two areas — we just check it doesn't throw and returns valid shape.
    // split_required may or may not be true depending on model confidence.
    const result = await classifyNarration(
      'The bin store door is broken and needs replacing. Also the car park barrier is stuck open.',
    )
    assertValidClassifyResult(result, 'multi-section narration')
    // If split_required is true, split_at must be a plausible index into the string
    if (result.split_required && result.split_at !== null) {
      assert.ok(result.split_at > 0, 'split_at must be > 0')
      assert.ok(
        result.split_at < 500,  // narration above is ~90 chars
        `split_at (${result.split_at}) seems too large for the narration length`,
      )
    }
  })

  test('does not throw or return null for a very short narration', { timeout: TIMEOUT_MS }, async () => {
    const result = await classifyNarration('Roof ok.')
    assertValidClassifyResult(result, 'very short narration')
  })

  test('returns consistent shape on second call (not a fluke)', { timeout: TIMEOUT_MS }, async () => {
    // Run the same fixture twice. Not asserting identical sections (AI is non-deterministic)
    // but both calls must return a structurally valid result.
    const a = await classifyNarration('The stairwell handrail is loose on the second floor landing.')
    const b = await classifyNarration('The stairwell handrail is loose on the second floor landing.')
    assertValidClassifyResult(a, 'stairwell narration run 1')
    assertValidClassifyResult(b, 'stairwell narration run 2')
  })
})
