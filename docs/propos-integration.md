# PropOS Integration Briefing — Absorbing the ASH Inspection App

> **For the PropOS session reading this.** This document is being pasted into a fresh PropOS development session. You have no prior context on the inspection app. This briefing is everything you need to plan the integration. The inspection app itself is at `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app` and you can grep it for detail — but you should be able to plan from this document alone. Treat it as a hand-off from an outgoing engineer to an incoming one.

**Status:** Inspection app is at v0.2.3, feature-complete, in field use with a single firm (ASH Chartered Surveyors). No engineering work is in flight on it. PropOS Phase 3 (Financial) is the active workstream; this absorption is **Phase 4 or 5** depending on Ben's priority call.

**Goal of the integration:** Fold the inspection app into PropOS as a re-usable module so any firm on PropOS can do inspections, and so the same engine can serve adjacent verticals (lettings, security, fire door) by configuration alone — no engine rewrite.

---

## 1. What the inspection app is, distilled

A property manager opens an Android app, picks a building, narrates observations into the phone while walking the property, takes photos, and finishes by tapping "Complete". A few seconds later they receive an email with a branded Word document, PDF, and self-contained HTML version of the inspection report. Voice is transcribed by Deepgram and turned into professional prose by Claude Sonnet; photos are described by Claude Opus. The whole flow is offline-first — the phone keeps working below ground.

It exists because ASH Chartered Surveyors do monthly walks of residential blocks and the previous workflow was clipboard-and-pen. The app is built for that workflow but the engine doesn't care about the specifics — it can be repointed at lettings inventories or security patrols by swapping configuration, not code.

That's the load-bearing claim of this whole document, and §7 details the abstractions that make it true.

---

## 2. Tech stack

| Layer | Stack |
|---|---|
| Android app | Capacitor 6 + React 18 + TypeScript + Tailwind |
| Backend | Node 20 + Express + TypeScript, deployed on Railway |
| Database + Auth | Supabase Postgres (intended `eu-west-2`) |
| Object storage | Supabase Storage bucket `inspection-files` |
| Voice transcription | Deepgram (server-side only) |
| AI | Anthropic: `claude-sonnet-4-6` (all text) and `claude-opus-4-6` (image only) |
| Email | Resend |
| Weather | Open-Meteo + Nominatim (no API keys) |
| PDF | LibreOffice via Docker, runs server-side |

You will recognise most of this — it's the same stack PropOS uses for the same reasons. That's deliberate.

---

## 3. What's already aligned with PropOS conventions

The inspection app was written from the start to ease this integration. Things you do **not** need to redo:

- **Single source of truth for AI model identifiers** in `server/config/models.ts`. PropOS's `ANTHROPIC_RUNTIME_MODEL` env var is the natural successor.
- **Stage-tagged pipeline errors.** `/api/generate-report` returns `{ok: false, stage, message}` on failure. The app's `ReportError` class preserves the stage. Mirror in any future multi-step route.
- **Inline error UI, not `alert()`.** Already enforced in the inspection app's `RecordButton.tsx` etc.
- **Real services in tests, no mocks.** Unit tests use real `buildReportDocx`; integration tests hit the real Anthropic API. Rule: *fix the code, never skip the test*.
- **Ownership re-checks in handlers.** Every route that mutates inspection data verifies `inspection.inspector_id === req.userId` after fetching the row (defence-in-depth even with RLS).
- **`FORWARD: PROD-GATE` marker** at every PoC compromise. Grep this in the inspection repo — as of v0.2.3 there are zero hits. Continue the convention.
- **Append-only audit pattern** used by the bug-tracker lifecycle. Replicate for inspection-state changes.

Things you **will** need to retrofit (see §8):

- `firm_id` propagation
- JWT `user_role` and `firm_id` claims (currently the inspection app reads `role` from `public.users` on every request)
- Soft-delete pattern
- Explicit `WITH CHECK` on RLS policies (current policies use `FOR ALL USING(...)` — functionally correct via USING-as-WITH-CHECK fallback, but not PropOS convention)

---

## 4. The inspection module — what it owns

When folded in, the inspection module owns:

| Layer | Responsibility |
|---|---|
| **Capture surface** | Voice + camera + tap UI, offline SQLite queue, in-app updater, signature capture |
| **Transcription** | Deepgram client (server-side) |
| **Classification** | Section classifier (Sonnet) |
| **Photo analysis** | Per-photo description + suggested section (Opus) |
| **Report assembly** | DOCX + PDF + HTML report builders, parameterised by report template |
| **Pre-report checklist** | Section coverage gate before generation, with reassignment + N/A flow |
| **Sync queue** | SQLite → Supabase, retry-tolerant |

The inspection module does **not** own:

- Authentication flow itself (PropOS handles)
- User CRUD / firm CRUD / role management UX (PropOS handles)
- Billing, seats, usage UX (PropOS Phase 3 handles)
- Cross-module portfolio dashboards (PropOS chassis handles, but inspection module exposes the data)
- Soft-delete enforcement and retention sweeps (chassis cron)

Communication between chassis and module is:

- **Postgres rows scoped by `firm_id`** — chassis sets up the firm row, module reads/writes within it
- **JWT claims** — `firm_id` and `user_role` read by both sides
- **Config table reads** — module pulls template, prompt pack, branding at runtime
- **Optional webhook on `report_generated`** — chassis updates portfolio dashboards / billing meters

This is a loose coupling. The module can be removed and PropOS still works.

---

## 5. Data model the module needs

Eight tables. The chassis-owned ones (`firms`, `users`, etc.) are noted where they intersect.

| Table | Owner | Notes |
|---|---|---|
| `firms` | Chassis | Already exists. Inspection module reads branding, regulatory_text, email_from, region |
| `users` | Chassis | Already exists. Inspection module adds `signature_path text` if not present, expects `firm_id`, `role`, `job_title` |
| `properties` | Module | Per-firm portfolio: id, ref, name, address, units, management_company, has_car_park, has_lift, has_roof_access |
| `inspections` | Module | id, property_id, inspector_id, **firm_id**, inspection_type, status, start_time, end_time, report_sent, **is_active**, **deleted_at** |
| `observations` | Module | id, inspection_id, section_key, template_order, raw_narration, processed_text, action_text, risk_level, classification_conf |
| `photos` | Module | id, inspection_id, observation_id, storage_path, caption, opus_description (jsonb) |
| `bug_reports` | Module | Per-firm in-app feedback with lifecycle (status, resolution_notes, resolved_version, duplicate_of) |
| `api_usage_log` | Module | Append-only: service, model, endpoint, input_tokens, output_tokens, cost_usd, inspection_id, user_id, **firm_id** |
| **New: `inspection_templates`** | Module | Per-firm or platform-default section configs (see §7) |
| **New: `prompt_packs`** | Module | Per-firm or platform-default AI prompt sets |
| **New: `report_templates`** | Module | Per-firm or platform-default DOCX/HTML layouts |

Bold columns are added during the integration. The schema migrations to do this are sequenced in §10.

### 5.1 Storage layout

Single Supabase Storage bucket `inspection-files`:

```
<firm_id>/<property_id>/<inspection_id>/<photo_id>.jpg     ← photos
<firm_id>/<property_id>/<inspection_id>/report.docx        ← generated reports
<firm_id>/signatures/<user_id>.png                          ← inspector signatures
```

The `<firm_id>` prefix is added during integration. The current single-firm app omits it. RLS policies are scoped accordingly.

---

## 6. AI pipeline — what calls exist, in what order, with what prompts

Every AI call is in `server/routes/generateReport.ts` or `server/services/anthropic.ts`. Models are pinned in `server/config/models.ts`. Cost is logged per call to `api_usage_log`.

### 6.1 Call sequence per report

1. **Classification** *(during capture, not report time)* — Sonnet, `/api/classify`. Per observation. Returns `{ section_key, confidence: 'high'|'low', split_required, split_at? }`. Property name/ref/address prepended as autocorrect context.
2. **Photo analysis** *(during sync, not report time)* — Opus, `/api/analyse-photo`. Per photo. Returns `{ suggested_caption, description, notable_issues[], section_key }`.
3. **Observation processing** *(at report time, idempotent)* — Sonnet. Per unprocessed observation. Voice narration → professional prose + action_text + risk_level (High / Medium / Low / null).
4. **Photo-only synthesis** *(at report time)* — Sonnet. For any section with photos but no narration, synthesises a professional observation paragraph from the Opus descriptions.
5. **Recurring item identification** *(at report time)* — Sonnet. Compares current observations against previous inspection's `action_text` list, returns indices of still-outstanding items.
6. **Duplicate photo detection** *(at report time)* — Sonnet. Per section. Returns indices of photos to demote to appendix-only (so a section doesn't show the same crack six times).
7. **Overall summary** *(at report time)* — Sonnet. Property-level condition summary from the processed observations.
8. **Late photo analysis** *(at report time, only if missing)* — Opus. Backfill for any photo that failed sync-time analysis.

Total cost per report at current scale: well under £0.20.

### 6.2 Prompts

Live in `server/prompts/` — one file per use case. They are short, JSON-output-constrained, and idempotent. Highlights:

- **`classify.ts`** — strict JSON output, 12 section keys hardcoded
- **`analyseImage.ts`** — strict JSON output, structured (description / notable_issues / suggested_caption / section_key)
- **`processObservation.ts`** — voice → prose + action + risk
- **`generateSummary.ts`** — overall condition summary in property-manager voice

These are the **default `pm_block` prompt pack**. When promoting to PropOS, copy them into a `prompt_packs` row with `firm_id = NULL` (platform default), `inspection_type = 'pm_block'`, `version = 1`. Future firms or markets can fork.

### 6.3 Failure semantics

Every AI call is non-fatal. If classification fails, observation defaults to `additional`. If image analysis fails, the photo still appears in the report (just without a caption). If dedup fails, all photos render. If summary fails, a fallback string is used. The inspector always receives a report.

---

## 7. The merge claim — what's firm-specific vs market-specific vs universal

The engine has six logical components. Each is replaceable independently:

| # | Component | Universal | Firm-specific | Market-specific |
|---|-----------|-----------|---------------|-----------------|
| 1 | Capture surface (voice, camera, tap UI) | Engine | — | Section template |
| 2 | Transcription (Deepgram) | Engine | — | Language model |
| 3 | Classification (Sonnet) | Engine | — | Section taxonomy + prompt pack |
| 4 | Photo analysis (Opus) | Engine | — | Style of caption + what to flag |
| 5 | Report assembly | Engine | Branding | Template + statutory text |
| 6 | Delivery (email + storage + audit) | Engine | From-address + retention | Signatories |

The claim is: **all firm-specific or market-specific differences can be expressed as configuration records, with no runtime code branching.** If a particular code path resists that claim during the integration, that path needs refactoring before the firm/market in question can be onboarded.

### 7.1 Firm configuration record (`firms` table — chassis-owned)

PropOS already has `firms`. Add or confirm these columns:

```
brand_primary text       -- hex, e.g. "#1F3864"
brand_secondary text
brand_accent text
display_name text         -- shown in DOCX/HTML header
address_block text        -- multi-line address for header
regulatory_text text      -- e.g. "ASH Chartered Surveyors is regulated by RICS"
email_from text           -- e.g. "reports@firmdomain.co.uk"
disclaimer_default text   -- footer disclaimer when no inspection-type override
default_template_id uuid  -- which report template to use if no per-inspection-type override
logo_path text            -- storage path to firm's logo PNG
```

### 7.2 New module-owned tables

```sql
create table inspection_templates (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid references firms(id),   -- null = platform default
  inspection_type text not null,
  version         int  not null,
  sections        jsonb not null,              -- section definitions (key, label, order, gating flags)
  is_active       bool default true,
  created_at      timestamptz default now()
);

create table prompt_packs (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid references firms(id),
  inspection_type text not null,
  version         int  not null,
  classify_system     text not null,
  process_obs_system  text not null,
  summary_system      text not null,
  image_system        text not null,
  recurring_system    text not null,
  dedup_system        text not null,
  synth_photo_system  text not null,
  is_active       bool default true,
  created_at      timestamptz default now()
);

create table report_templates (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid references firms(id),
  inspection_type text not null,
  version         int  not null,
  docx_template   bytea,                       -- compiled DOCX template
  html_layout     text,                        -- HTML report shell with placeholders
  branding        jsonb not null,
  disclaimer_text text not null,
  is_active       bool default true,
  created_at      timestamptz default now()
);
```

Template resolution at request time:

```
firm-specific (firm_id = X, type = Y)
  → if none, market default (firm_id = NULL, type = Y)
    → if none, platform default (firm_id = NULL, type = 'pm_block')
```

### 7.3 Universal vs configurable boundary in code

Currently hardcoded, must become config reads:

| Hardcoded in inspection app | Becomes |
|---|---|
| Tailwind `ash-navy`, `ash-mid`, `ash-light` palette | CSS variables injected at app boot from `firms.brand_*` |
| `"ASH CHARTERED SURVEYORS"` in DOCX/HTML header | `firms.display_name` |
| `"1-5 Kew Place, Cheltenham GL53 7NQ"` in header | `firms.address_block` |
| RICS regulation line in Declaration block | `firms.regulatory_text` |
| `reports@propertyappdev.co.uk` Resend from-address | `firms.email_from` |
| 12 fixed sections in `app/src/types/index.ts` | `inspection_templates.sections` JSON |
| Disclaimer in footer | `report_templates.disclaimer_text` |
| Risk-level timeframes (`High → 5 working days` etc.) | Either kept universal (RICS aligned) or moved into `report_templates` if a market needs different timeframes |

---

## 8. Module boundary (loose coupling)

PropOS chassis owns:
- Authentication, JWT issuance, SECURITY DEFINER hook injecting `firm_id` and `user_role`
- Firm CRUD, user CRUD, role management
- Billing, seats, usage telemetry, invoice generation
- Audit log infrastructure (append-only with CHECK constraints)
- Branding store, template store, prompt-pack store
- Cross-module portfolio dashboards
- Notifications
- Soft-delete enforcement and retention sweeps
- Region pinning, backups, DR
- White-label APK build pipeline (one Android build job per branded firm — see §11.7)

Inspection module owns:
- Voice/camera capture, offline SQLite queue
- Transcription, classification, photo analysis, processing, dedup, synthesis pipelines
- DOCX + PDF + HTML report builders
- Pre-report checklist UX
- Sync queue
- In-module audit (observation reassignment, etc.)
- In-app updater + signature capture
- Reports the things billing needs (counts, AI cost via `api_usage_log`, generation rate)

The two communicate by table rows scoped by `firm_id`, JWT claims, runtime config reads, and one optional webhook (`report_generated`). Either could be replaced.

---

## 9. Market verticals — illustrative, not committed

The same engine, three different markets. Each is config + template + prompt pack, **not** engine rewrite.

### 9.1 Lettings agency (inventory / check-in / check-out / mid-term)

- **Audience:** ARLA / Propertymark lettings agents, BTR operators, independent landlords
- **Statutory:** Housing Act 2004 (HHSRS), Tenant Fees Act 2019, Deregulation Act 2015, TDS/DPS deposit-dispute evidence standards
- **Section template:** Room-driven (inspector defines rooms at start; per-room subheadings for walls/floor/ceiling/fixtures/windows/doors/contents)
- **Prompt pack changes:** classifier maps to dynamic room set; processor distinguishes *fair wear* vs *tenant liable*; image analysis uses deposit-dispute-evidence language
- **Report template changes:** tenant name, landlord name, deposit scheme reference; per-room condition pages; tenant counter-signature on check-in/out; wear-and-tear appendix
- **New capability needed:** Tenant signature captured on the inspector's device alongside the agent's. Both embed in the report.
- **Estimated effort:** 2–3 weeks, almost entirely in templates + prompts

### 9.2 Security patrol & incident reporting

- **Audience:** SIA-licensed manned-guarding firms, retail loss-prevention, vacant-property insurance compliance
- **Statutory:** Private Security Industry Act 2001, BS 7858:2019, insurance vacant-inspection clauses, evidential chain-of-custody for incident reports
- **Section template:** Patrol-route-driven, checkpoint-based. Each checkpoint has fixed items (gates, locks, lights, signs of forced entry, alarm status, CCTV functioning, hazards). GPS captured per observation.
- **Prompt pack changes:** classifier maps to checkpoint items; processor uses neutral evidential language; risk levels become `nil` / `observation` / `incident_minor` / `incident_major`; image analysis prioritises serial numbers, signage, vehicle plates, time-stamped clocks, evidence of forced entry
- **Report template changes:** SIA licence number in header; timestamp + GPS per entry; incident reports get separate chain-of-custody document with witness statement section
- **New capability needed:** Geolocation per observation (Capacitor `@capacitor/geolocation`). Incident escalation alert path — High-risk in security context triggers immediate notification to designated escalation address, not just the routine end-of-walk email.
- **Estimated effort:** 3–4 weeks, mostly geolocation plumbing + escalation alert path

### 9.3 Fire door inspection (RRO / BSA)

- **Audience:** Block managers and Responsible Persons under RRO 2005, owners of higher-risk buildings under BSA 2022
- **Statutory:** Regulatory Reform (Fire Safety) Order 2005, Building Safety Act 2022, BS 9999:2017, BS 8214:2016, BS EN 1634
- **Section template:** Door-by-door schedule. Each door has fixed sub-template (frame, leaf, intumescent seals, smoke seals, hinges, closer, signage, vision panel, hold-open devices, threshold gap). Per-door unique IDs (QR/NFC scan or manual entry).
- **Prompt pack changes:** classifier maps to door components; processor uses statutory language and tags every defect with remediation priority (Immediate / 24 hours / 28 days) and cites the BS or RRO clause that applies
- **Report template changes:** per-door schedule page; Responsible Person signature, not just inspector signature
- **New capability needed:** QR-code scanning (Capacitor barcode-scanner plugin). Worth picking the most common door-tag format (likely QR) over RFID for cost.
- **Estimated effort:** 2–3 weeks. This is the most likely first-after-ASH vertical to ship — Richard Smith (ASH partner) handles fire-safety work and the conversation has already started.

---

## 10. Migration sequence

Eight steps, each reversible. Run in order. ASH's user-visible experience should be unchanged throughout — they're the "live canary" verifying the abstraction at every step.

### Step 1 — Schema preparation *(no behaviour change)*

- Add `firm_id` columns as nullable to inspection-app tables
- Backfill all existing ASH rows with ASH's firm UUID
- Make `firm_id` NOT NULL
- Rewrite RLS to require both `firm_id = auth_firm_id()` AND existing scope (with explicit `WITH CHECK`)

### Step 2 — JWT claim adoption

- Adopt the PropOS SECURITY DEFINER hook (already exists in PropOS) so `firm_id` and `user_role` ride in the JWT
- Server auth middleware reads claims, with fallback DB read for old tokens during rollout
- Once all live tokens have claims, remove the fallback

### Step 3 — Soft-delete adoption

- Add `is_active`, `deleted_at` to inspection-side tables
- Rewrite `deleteInspection()` and equivalents to UPDATE
- Stand up retention sweep cron (chassis-owned)

### Step 4 — Branding abstraction

- Extract ASH-specific strings/colours into a `firms` row for ASH
- Replace hardcoded references in DOCX and HTML report builders with config lookups
- Smoke-test: ASH report output should be byte-identical (or near-identical) to v0.2.3

### Step 5 — Template, prompt-pack, report-template abstraction

- Extract 12 PM sections from `app/src/types/index.ts` and server config into a default `pm_block` template row (`firm_id = NULL`)
- Extract prompts from `server/prompts/` into default `pm_block` prompt pack
- Extract DOCX layout from `server/services/reportGenerator.ts` and HTML layout from `server/services/htmlReportGenerator.ts` into default `pm_block` report template
- Replace hardcoded references with config lookups
- Smoke-test ASH again

### Step 6 — Module split

- Split inspection app's React components into a PropOS monorepo workspace (or publishable npm-private module)
- Split server-side routes into the same module
- PropOS consumes the module
- Build ASH as `firm: ASH, market: pm_block` — should be functionally identical to v0.2.3

### Step 7 — Second firm and/or second market

The first new firm onboards through the configuration flow only (§7) — no code change. The first new market (most likely fire_door per §9.3) onboards by adding template + prompt pack + report template — no engine code change. **This step proves the merge claim.** If it can't be done without engine changes, that's a refactor signal.

### Step 8 — Decommission standalone repo

Once the PropOS-hosted ASH path is identical and stable for ~30 days of field use, archive `ash-inspection-app`. The codebase lives in PropOS. Android APK ships from PropOS's build pipeline thereafter.

---

## 11. Risks and open questions

Honest list. Eight items.

### 11.1 Theme leak into DOCX

CSS variables work for the React app and HTML report. The `docx` Node library compiles colour values into XML at build time — the report builder needs an explicit per-firm path (palette lookup at start of `buildReportDocx`, threaded through cell shading and text colour). Few hours of refactor.

### 11.2 Prompt-pack regression

Editable per-firm prompt packs are powerful and dangerous. A firm could tune themselves into bad classification. PropOS needs:
- Read-only platform-default pack that always exists and can never be deleted
- "Diff against default" view for any custom pack
- Optional A/B testing against the default to catch regression

### 11.3 Template versioning and historical reports

A report generated in 2026 must regenerate cleanly in 2031 even if branding has changed. Solutions:
- `inspections.template_id` and `inspections.report_template_id` snapshot at generation time
- Templates versioned; edits create a new version with old still readable
- Soft-delete of templates permitted; hard-delete forbidden if any inspection references the row

### 11.4 Cross-firm leak via shared AI provider

Anthropic, Deepgram, Resend are shared. A bug in prompt construction could leak one firm's property names into another firm's call. Mitigations:
- Only `inspection_id` (firm-scoped UUID) is passed as identifier
- Prompt construction code is pure: input → prompt → output, no shared state
- Verifiable by code review and unit test

### 11.5 GDPR cross-firm risk

`firm_id`-scoped RLS protects logical cross-firm access. It doesn't protect against operator error (a `platform_admin` joining across firms by accident). PropOS needs:
- `platform_admin`-only audit log of cross-firm queries
- Two-person approval for any platform-level destructive operation
- Per-firm data export endpoints (so a firm leaving PropOS takes their data with them — GDPR Article 20)

### 11.6 Module versioning across firms

PropOS is SaaS, not per-firm install. If the inspection module ships v3.0.0 with a schema migration, every firm migrates simultaneously. Therefore:
- Schema migrations must be backward-compatible for at least one minor version
- Module APIs follow semver
- A firm with a pinned-to-v2 custom prompt pack continues functioning while v3 is the default; pinning is supported

### 11.7 White-label APKs

Some firms will want their own branded APK (their logo, their app icon, their name on the home screen). PropOS needs a per-firm build pipeline:
- One Android build job per branded firm
- Each build pulls firm config at compile time, bakes logo + app name in
- Each signed with firm's keystore (or PropOS-managed keystore in firm's name)
- Update channels per firm

This is a build-pipeline question, not runtime. Non-trivial but well-bounded.

### 11.8 Pricing model

Not defined. Likely some combination of seats (per inspector), volume (per inspection), AI cost passthrough. `api_usage_log` already captures everything billing would need. Commercial decision out of scope of integration architecture; data needed to support any model is already there.

---

## 12. Effort estimate

Single-developer pace observed during inspection-app build:

| Step | Effort |
|---|---|
| 1. Schema preparation | 2–3 days |
| 2. JWT claim adoption | 2 days |
| 3. Soft-delete adoption | 2 days |
| 4. Branding abstraction | 3–4 days |
| 5. Template / prompt-pack / report-template abstraction | 1–2 weeks |
| 6. Module split | 1 week |
| 7. Second firm + second market onboarding | 1–2 weeks (polish surface from production use) |
| 8. Decommission standalone repo | 1 day |
| **Total to "merge complete, one extra firm + one extra market live"** | **~7–9 weeks of focused work** |

Vertical implementations (lettings, security, fire door) sit on top of this: **2–4 weeks each**, dominated by template authoring, statutory language work, and prompt-pack tuning rather than engine code.

---

## 13. Where to look in the inspection app codebase

Repository: `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app` (private GitHub: `randommonicle/ash-inspection-app`).

Documents the PropOS session should read in order:

1. `CLAUDE.md` — developer guide, conventions, gotchas. Long but authoritative.
2. `README.md` — high-level overview.
3. `audit/SPECIFICATION.md` — system specification (written for the independent auditor, but the technical sections are useful here too).

Code paths most relevant to the integration:

| What you want to find | File |
|---|---|
| 12 section keys (section taxonomy) | `app/src/types/index.ts` |
| Server-side AI model identifiers | `server/config/models.ts` |
| All AI prompts | `server/prompts/*.ts` |
| Report generation pipeline (all 10 stages) | `server/routes/generateReport.ts` |
| DOCX builder | `server/services/reportGenerator.ts` |
| HTML report builder | `server/services/htmlReportGenerator.ts` |
| Email send | `server/services/email.ts` |
| Photo resize | `server/services/imageProcessor.ts` |
| JWT auth middleware | `server/middleware/auth.ts` |
| Rate limiting config | `server/middleware/rateLimits.ts` |
| Supabase RLS migrations | `supabase/migrations/*.sql` |
| Inspector signature capture (Android) | `app/src/components/SignatureCapture.tsx` |
| Login-time gate flow | `app/src/App.tsx` |
| Test suites | `server/tests/{unit,integration}.test.ts` |

Things to `grep` across the repo when planning the abstraction:

- `ASH` and `ash-` — every literal occurrence of the firm name or its Tailwind colour tokens. Each one becomes config.
- `propertyappdev.co.uk` — the firm's email-sending domain. Becomes `firms.email_from`.
- `RICS` — regulatory references. Become `firms.regulatory_text`.
- `1-5 Kew Place` — address block. Becomes `firms.address_block`.
- `claude-sonnet-4-6` and `claude-opus-4-6` — model identifiers. Should be in `server/config/models.ts` only. Verify no strays.
- `FORWARD: PROD-GATE` — should return zero hits as of v0.2.3. If it returns any, that's a PoC compromise that needs handling before integration.

---

## 14. What this document deliberately does NOT cover

- **iOS support** — separate workstream when a macOS machine is available. Not blocking.
- **Specific PropOS Phase 4 / 5 ticketing** — depends on PropOS's own roadmap state.
- **Commercial pricing model** — not architecture.
- **Detailed market sizing** — verticals in §9 are illustrative of capability, not commitments.
- **AI provider portability** — inspection app uses Anthropic. If PropOS ever needs OpenAI/local-model support, the prompt-pack abstraction (§7.2) is the place to plug it. Not a blocker for this integration.

---

## 15. Bottom line

The inspection app is not a vertically-integrated product. It's an inspection engine wearing ASH-branded clothing. The clothing comes off cleanly. PropOS provides the chassis the inspection app was never meant to build on its own (auth, multi-tenancy, billing, audit, operator UX, retention). Folding the two together gives PropOS a high-value module on day one and gives the inspection app the scale infrastructure it has always needed.

The merge claim (§7) is the load-bearing assertion: every firm-specific component is firm-config; every market-specific component is template-plus-prompt-pack; no runtime branching required. The migration sequence in §10 is the operational test of that claim — each step is reversible, and step 7 ("second firm + second market") is where the claim either proves itself or identifies the code path that needs refactoring.

If you're the PropOS session reading this and you spot something that contradicts the claim — a code path that *must* branch on firm or market — that's the most useful thing this document can produce. Flag it before any code lands.

— *End of integration briefing.*
