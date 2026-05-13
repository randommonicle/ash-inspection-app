# ASH Inspection App — System Specification

**Document version:** 1.0
**Date prepared:** 13 May 2026
**Software version at preparation:** v0.2.3
**Prepared by:** Ben Graham, Senior Property Manager and developer, ASH Chartered Surveyors

---

## 1. Document Purpose

This specification accompanies a formal independent audit of the ASH Inspection App. Its purpose is to describe — in concrete, verifiable detail — what the system does, how it is built, how data flows through it, what statutory and contractual obligations sit upon it, and where the development team currently understands its limitations to be.

The specification is deliberately exhaustive. Where features or controls are *not yet* in place, or where decisions have been deferred, this is stated explicitly. The audit team is invited to treat any apparent omission as an invitation to ask — the codebase is the authoritative reference and is available for inspection in full.

---

## 2. Product Overview

### 2.1 What the system is

The ASH Inspection App is a single-firm Android application used by Property Managers (PMs) at **ASH Chartered Surveyors** to conduct routine periodic inspections of residential leasehold blocks. Inspections were previously paper-based; the app replaces clipboard-and-pen capture with voice-narrated, AI-classified, photo-evidenced digital records, and produces a branded inspection report (Word document, PDF, and self-contained HTML) automatically.

### 2.2 What the system is **not**

- It is **not** a structural survey tool. Inspections are visual, conducted from accessible common areas only. Every generated report carries a disclaimer to that effect (see §8.3).
- It is **not** a RICS Home Survey. ASH Chartered Surveyors is RICS-regulated, but these reports are internal/management instruments, not statutory survey reports.
- It is **not** a fire-door or Building Safety Act compliance tool. A separate inspection type for fire-door work is on the future roadmap (see §11) but is not yet implemented.
- It does **not** handle client money, lease accounting, or any financial transactions. It is purely a data-capture and document-generation system.
- It does **not** at present support iOS. iPhone PWA / native iOS is on the future roadmap (see §11). All current users hold an Android device issued for the role.

### 2.3 User population

| Role | Count (May 2026) | Purpose | Authentication |
|------|------------------|---------|----------------|
| Inspector | 2 (Ben Graham, Pete Birch) | Conduct inspections, generate reports | Supabase Auth email + password |
| Admin | 1 (Ben Graham) | Operate `/admin` dashboard, manage bug-report lifecycle | Separate HTTP basic auth on dashboard route |

No external recipients of the report have logins. Reports are emailed as attachments. Management companies, leaseholders, and contractors receive reports only via forwarded email — they have no account, no API access, and no ability to mutate any stored data.

### 2.4 Operational status

- **Development complete:** Phases 1–6 (see §3) are complete.
- **Field tested:** 1 May 2026 (first 4G field test with Pete Birch). Subsequent test inspections through May 2026.
- **Live production data:** None yet. The database contains test inspections only, which will be wiped before go-live (see §10.3).
- **Live release channel:** Signed APK distributed via GitHub Releases. In-app version checker prompts users to download new builds via Chrome Custom Tab → Android download manager.

---

## 3. Development Phase History

The build was structured in numbered phases. Each phase was a coherent unit of work delivered, field-tested, and stabilised before the next phase began. The phase sequence and dates below are the authoritative iteration history.

### Phase 1 — Authentication and Property List *(complete)*

- Supabase Auth set up with email/password sign-in.
- `public.users` profile table (full_name, email, role, job_title) joined to `auth.users` by shared UUID.
- `public.properties` table populated with ASH's portfolio.
- Property List screen on Android.

### Phase 2 — Capture *(complete)*

- Audio recording on Android via web MediaRecorder API.
- Voice transcription via Deepgram (initially client-side; moved server-side in Phase 6 for security — see §4.4).
- Local persistence via Capacitor SQLite plugin.
- Camera plugin for photo capture.

### Phase 3 — AI Classification *(complete)*

- Section classifier using `claude-sonnet-4-6` via Anthropic API.
- Twelve fixed inspection sections defined in `app/src/types/index.ts`.
- Low-confidence narrations surface a confirmation banner; high-confidence ones auto-save.
- Manual section override picker available at any time on each observation.

### Phase 4 — Sync and Image Analysis *(complete)*

- Background sync queue uploads completed inspections to Supabase.
- Photos uploaded to Supabase Storage bucket `inspection-files`.
- Each photo analysed by `claude-opus-4-6` (image-understanding model) — caption and section_key suggested and stored alongside the photo record.

### Phase 5 — Report Generation *(complete)*

- Server-side pipeline assembles a branded Word document matching the existing ASH template exactly.
- Observation text processed by Sonnet from raw voice narration into professional prose; risk level and action text extracted.
- Overall condition summary generated by Sonnet.
- Recurring-items table comparing the current inspection against the most recent prior inspection at the same property.
- Email delivery via Resend.

### Phase 5.5 — First Field Test Iteration *(complete)*

Triggered by the first field test (1 May 2026, Pete Birch, property H53). Findings:
- Phonetic misspellings of property names in voice transcripts → added property-context preamble to AI prompts.
- Recurring items not surfacing → fixed previous-inspection query to include `status IN ('completed','report_generated')`.
- PDF requested → added DOCX → PDF conversion via LibreOffice on the Railway server.
- Dual-email requested → both Ben and Pete receive each report.

### Phase 6 — Hardening, UX Maturity, and Distribution *(complete)*

Largest phase. Items delivered (with the date or commit marker where useful):

| Sub-item | Status |
|---|---|
| Photo appendix with internal Word bookmarks | ✅ |
| Pre-report checklist (covers / N/A / reassignment, with feature-flag prompt for car park / lifts) | ✅ |
| Auto-fill weather (Open-Meteo + Nominatim, no API key, ERA5 fallback) | ✅ |
| Projected next inspection date | ✅ |
| **Full security hardening** (JWT auth, rate limits, ownership checks, body cap, CORS allowlist, Deepgram moved server-side) — see §6 | ✅ |
| Photo-only / photo-first observation synthesis | ✅ |
| Non-blocking transcription (per-recording queue) | ✅ |
| Checklist reassignment with sync repair | ✅ |
| Sync progress indicator (3-state UI) | ✅ |
| In-app update checker + `UpdatePrompt` bottom sheet | ✅ |
| Photo resize via sharp (2048 px, JPEG q82) — fixes Anthropic 5 MB and Resend 40 MB caps | ✅ |
| Bug-tracker lifecycle (status / resolution / dedup / My Reports) | ✅ |
| HTML report as third delivery format (self-contained, CSS lightbox) | ✅ |
| Camera burst loop (re-opens camera after each shot) | ✅ |
| Auto-delete local photos after report sent (frees device storage) | ✅ |
| Tap-to-fullscreen photo viewer (shared component, all photo surfaces) | ✅ |
| AI-based duplicate photo grouping (Sonnet identifies same-subject duplicates within a section) | ✅ |
| Inspector signature capture (touchscreen pad, embedded in every report) | ✅ |
| Test infrastructure (18 unit tests + 6 integration tests with real Anthropic API) | ✅ |
| Android release signing pipeline (keystore, Gradle config, signed APKs from v0.2.0 onward) | ✅ |
| Tap-to-fullscreen on photos | ✅ |
| `REPORT_TO_OVERRIDE` removed (each inspector now receives their own reports) | ✅ |

### Phase 7 and beyond — Out of scope at this time

Originally Phase 7 was an in-app "Action Items" workflow screen (track open actions across inspections). That work has been **reassigned** to a sibling project, **PropOS** (a multi-firm property-management system also under development by Ben Graham). Reasoning: an inspection report is a snapshot in time; tracking ongoing action items across many inspections is workflow, and workflow belongs in a dedicated system, not in a per-report file or a per-inspection screen.

The inspection app is therefore approaching a stable "feature complete" state at v0.2.3. The remaining roadmap is **bug-squashing** (during field use), **stabilisation**, and eventually **integration into PropOS** as an unbranded module.

---

## 4. System Architecture

### 4.1 High-level diagram (text)

```
[Android device]                            [Railway server (Node 20)]
 ┌─────────────────────┐                    ┌─────────────────────────────┐
 │ Capacitor + React   │ ──HTTPS───────────►│ Express + TypeScript        │
 │ TypeScript          │                    │ Auth middleware (JWT verify)│
 │ SQLite (local)      │                    │ Rate limiter middleware     │
 │ Camera, Filesystem  │                    │ Routes:                     │
 │ KeepAwake plugin    │                    │  • /api/classify            │
 └──────────┬──────────┘                    │  • /api/analyse-photo       │
            │                               │  • /api/transcribe          │
            │                               │  • /api/generate-report     │
            │                               │  • /api/bug-report          │
            │                               │  • /api/version             │
            │                               │  • /admin (HTTP basic auth) │
            │                               └────────┬─────────────┬──────┘
            │                                        │             │
            │                          ┌─────────────▼─────┐  ┌────▼─────────┐
            │                          │  Anthropic API    │  │  Deepgram    │
            │                          │  Sonnet 4.6 +     │  │  (transcribe)│
            │                          │  Opus 4.6 (image) │  └──────────────┘
            │                          └───────────────────┘
            │                                        ┌──────────────────┐
            └──────HTTPS─Supabase JS client─────────►│  Supabase        │
                  (anon key, RLS-enforced)           │  Postgres + Auth │
                                                     │  + Storage       │
                                                     │  (UK or EU)      │
                                                     └──────────────────┘
                                        ┌─────────────┐
                                        │   Resend    │  ◄── reports emailed
                                        │   (SMTP)    │      to inspector
                                        └─────────────┘
                                        ┌─────────────┐
                                        │  Open-Meteo │  ◄── weather lookup
                                        │  Nominatim  │      (no API key)
                                        └─────────────┘
```

### 4.2 Components and responsibilities

| Component | Tech | Responsibility |
|---|---|---|
| **Android app** | Capacitor 6, React 18, TypeScript, Tailwind | Voice + photo capture, offline-first SQLite, sync, in-app updater, signature capture |
| **Backend server** | Node 20, Express, TypeScript, deployed on Railway | All AI calls (no AI key in app), report generation, email send, admin dashboard, version endpoint |
| **Database** | Supabase Postgres | Inspections, observations, photos, users, properties, bug reports, API usage log |
| **Object storage** | Supabase Storage bucket `inspection-files` | Photos, generated DOCX/PDF reports, inspector signatures |
| **Auth** | Supabase Auth | Email/password sign-in; JWT issued, validated server-side on every protected route |
| **Voice transcription** | Deepgram | Audio → text, called server-side only |
| **AI** | Anthropic | Section classification, observation processing, summary, recurring items, photo description, duplicate detection |
| **Email** | Resend | DOCX + PDF + HTML attachments to inspector's registered work email |
| **Weather** | Open-Meteo + Nominatim | Free, no API key, hourly weather at inspection start time |
| **PDF conversion** | LibreOffice (in Railway Docker image) | DOCX → PDF; non-fatal if unavailable |

### 4.3 Hosting and data residency

- **Server:** Railway, region selectable. *(Audit point: current Railway region needs explicit verification — see §10.1.)*
- **Supabase project:** EU region intended (`eu-west-2`). *(Audit point: explicit region confirmation required — see §10.1.)*
- **All third-party processors** (Anthropic, Deepgram, Resend, Open-Meteo, Nominatim) operate from US/EU data centres. Cross-border transfer notes in §7.5.

### 4.4 Why the architecture is shaped this way

A series of explicit decisions, recorded here so the audit team can evaluate intent as well as outcome:

- **Offline-first.** Inspectors regularly work in basements, plant rooms, and stairwells where signal is intermittent. All inspection data is written to SQLite first; sync to Supabase happens after `completeInspection()` and can retry indefinitely without data loss.
- **Server-side AI.** AI provider keys (Anthropic, Deepgram) are never present in the Android APK. The app authenticates to the server with its Supabase JWT; the server holds the AI keys. This was reworked in May 2026 specifically because Deepgram was initially client-side, which was an unacceptable security exposure for production.
- **Service-role key never reaches the app.** The app uses Supabase's "anon key" (PUBLIC.ANON) only. All write operations are gated by Row-Level Security policies that scope each row to the authenticated user. The service-role key (which bypasses RLS) lives only on the server, used for storage downloads and admin queries.
- **Single source of truth for AI model identifiers.** All AI model names are defined exclusively in `server/config/models.ts`. This is a PropOS convention adopted here so model upgrades touch one file, not twenty.
- **Stage-tagged errors.** The report-generation route returns `{ok: false, stage, message}` on failure. The app's `ReportError` class preserves the stage so the inspector sees *"Failed while sending the email — tap Retry"* rather than a generic "Report failed". This is a defence-in-depth pattern: the inspector knows whether to call IT or just retry.
- **Append-only audit tables.** Bug reports use an append-only update log; status changes never overwrite the original row. The same pattern will apply when action-item tracking ships in PropOS.
- **`FORWARD: PROD-GATE` marker.** Any code that is acceptable for development but must be reviewed before client-facing use carries this grep-able comment. As of v0.2.3, no instances remain in the repo. *(Audit point: grep the repo to verify.)*

---

## 5. Data Model

### 5.1 Tables (public schema)

| Table | Purpose | PII content | RLS status |
|---|---|---|---|
| `users` | Inspector and admin profiles (id, full_name, email, role, job_title, signature_path) | Name, email, signature | RLS enforced |
| `properties` | Building portfolio (id, ref, name, address, units, management_company, feature flags) | Address (low sensitivity — these are public-register buildings) | RLS enforced |
| `inspections` | One row per inspection (id, property_id, inspector_id, status, start_time, end_time) | Indirect (inspector_id link) | RLS enforced |
| `observations` | Voice-narrated observations (id, inspection_id, section_key, raw_narration, processed_text, action_text, risk_level) | Voice transcript may contain incidental personal data | RLS enforced |
| `photos` | Photo metadata (id, inspection_id, observation_id, storage_path, caption, opus_description) | Photo metadata only; binary in Storage | RLS enforced |
| `bug_reports` | Inspector-submitted issues with lifecycle (status, resolution_notes, resolved_version, duplicate_of) | Reporter name | RLS enforced |
| `api_usage_log` | Append-only log of every AI call (cost, tokens, endpoint, inspection_id, user_id) | Indirect | Admin-only read |

`auth.users` is managed by Supabase Auth and shadowed by `public.users` via shared UUID. **There is no password storage in `public.users`** — Supabase Auth handles password hashing (bcrypt by default in `auth.users`).

### 5.2 Storage (Supabase Storage bucket `inspection-files`)

| Prefix | Contents | Access |
|---|---|---|
| `<property_id>/<inspection_id>/<photo_id>.jpg` | Inspection photos | RLS: inspector can read/write own; server reads via service key |
| `<property_id>/<inspection_id>/report.docx` | Generated Word report | RLS: inspector can read own; server writes via service key |
| `signatures/<user_id>.png` | Inspector signature PNG | RLS: user can read/write only their own (added v0.2.3) |

### 5.3 Row-Level Security policies

Every public table has RLS enabled. Policies are scoped by `inspector_id = auth.uid()` (inspections, observations, photos) or `id = auth.uid()` (users self-access). Admin role bypasses RLS via service-role-key paths only (not via JWT).

Current RLS policies use `FOR ALL USING(...)` form. Postgres falls back to USING-as-WITH-CHECK so this is functionally correct, but the explicit `WITH CHECK` form is preferred and will be migrated when the schema is folded into PropOS (PropOS Engineering Conventions in `CLAUDE.md`).

### 5.4 Migrations

Migrations live in `supabase/migrations/`. They are timestamped and applied in order via the Supabase SQL editor (the project is not yet on Supabase's CLI migration pipeline — this is an open item). Current migrations:

```
20260505000002_registration_and_bugs.sql
20260505000003_api_usage_log.sql
20260505000004_seed_properties.sql
20260505000005_add_meter_reads_section.sql
20260513000001_bug_report_status_tracking.sql
20260513000002_inspector_signatures.sql
```

### 5.5 Backup and recovery

- Supabase performs automated daily backups of the Postgres database on its paid tier. *(Audit point: ASH currently on free tier — backup cadence to be confirmed and upgraded prior to go-live.)*
- Object storage is replicated by Supabase as part of its S3-backed infrastructure (provider-managed).
- No on-firm backup or restore drill has been performed yet. This is an open item for go-live.

---

## 6. Security Posture

This section enumerates the security controls in place, the rationale, and a candid statement of what is **not** yet in place.

### 6.1 Authentication

- **Inspectors:** Supabase Auth email + password. JWT issued, sent in `Authorization: Bearer <token>` header to every protected route.
- **Admin dashboard (`/admin`):** HTTP basic auth (username `admin`, password from `ADMIN_PASSWORD` env var). Sits behind a separate Express middleware.
- **No session persistence between cold starts.** The app explicitly clears the local Supabase session on every fresh process start (`AuthContext.tsx`). PMs use company-issued phones which may be passed between staff; mandatory re-login prevents one inspector submitting work under another's name.
- **Backgrounding the app does NOT trigger re-login** — the WebView JS runtime stays alive when the app is moved to the background, so backgrounded sessions remain authenticated until the OS kills the process.

### 6.2 Authorisation

- **JWT verified server-side** on every API route via `server/middleware/auth.ts`. Anonymous callers receive HTTP 401.
- **Per-route ownership checks** in `generateReport` and `analysePhoto` routes: the server confirms `inspection.inspector_id === req.userId` before doing any work. Returns 403 otherwise.
- **RLS enforces row-level access** for everything done via the app's anon-key Supabase client.

### 6.3 Rate limiting

`server/middleware/rateLimits.ts`, using `express-rate-limit`:

| Limit | Window | Endpoint |
|---|---|---|
| 200 req | 15 min | Global per-IP |
| 30 req | 1 min | `/api/classify` |
| 80 req | 10 min | `/api/analyse-photo` |
| 10 req | 1 hour | `/api/generate-report` |
| 120 req | 5 min | `/api/transcribe` |

Returns HTTP 429 with JSON body. `trust proxy 1` is set so Railway's reverse proxy doesn't mask the real client IP.

### 6.4 Request hardening

- `express.json({ limit: '50kb' })` body cap, except for `/api/transcribe` which uses `express.raw()` mounted *before* the JSON body parser (audio bodies are larger).
- **CORS allowlist** (`server/index.ts`): Railway URL, Capacitor's `capacitor://localhost` and `https://localhost` schemes. No wildcard.
- **HTTPS-only.** Android app's Capacitor config sets `androidScheme: 'https'`. There is no `allowMixedContent` or HTTP fallback. The legacy IP-whitelist allowNavigation list was removed in May 2026.

### 6.5 Secrets management

| Secret | Location |
|---|---|
| Anthropic API key | Railway env var; server-side only |
| Deepgram API key | Railway env var; server-side only (was client-side until May 2026, now removed from APK) |
| Supabase service-role key | Railway env var; server-side only |
| Resend API key | Railway env var; server-side only |
| `ADMIN_PASSWORD` | Railway env var |
| Supabase anon key | In app build via Vite env var (this is intended — anon key is RLS-bounded by design) |
| Android keystore | `app/android/ash-inspection.jks`, git-ignored; credentials in git-ignored `local.properties`; both also backed up to Dropbox |

No secret values appear in the repo. `.env.example` lists key names only.

### 6.6 Distribution security

- APKs are signed (RSA 2048-bit, 10000-day validity, alias `ash-inspection`).
- The app fetches `GET /api/version` on launch; if a newer version is available, the user is prompted to download the new APK from GitHub Releases via a Chrome Custom Tab → Android download manager flow.
- There is no current Play Store presence. Updates are sideloaded. The first install on each new device must be done by the IT-equivalent operator (currently Ben Graham); subsequent updates are picked up via the in-app prompt.

### 6.7 Logging and monitoring

- Server logs to Railway's deployment console (retained by Railway).
- Admin dashboard surfaces: live inspections, recent history, inspector list, property portfolio, bug reports, AI cost ledger. Refreshes every 30 s.
- AI cost is logged per call to `api_usage_log` with service, model, endpoint, input/output tokens, USD cost, inspection_id, user_id.
- **No application-level structured logging product (e.g. Sentry, Datadog).** This is an open item for go-live but not currently funded — Railway's native logs are the source of truth.

### 6.8 What is **NOT** in place

This list is deliberately exhaustive.

- **No formal penetration test** has been commissioned.
- **No SAST or dependency-vulnerability scanner** in CI. (`npm audit` is run manually before each release. CI does not yet exist beyond the manual test runs.)
- **No supply-chain attestation** (SBOM, provenance, sigstore).
- **No multi-factor authentication** on Supabase Auth. PMs sign in with email + password only. *(Justification: pragmatic for two users on company-issued devices, but flagged for review at scale.)*
- **No automatic session timeout while in foreground.** App-level inactivity is unconstrained while the inspection is open. The cold-start sign-out (§6.1) is the primary control.
- **No formal incident response runbook.** Ben Graham is the sole responder.
- **CI/CD pipeline is `git push → Railway auto-deploys`.** There is no automated test gate; the developer runs `npm run test:unit` locally before pushing. This is an honesty point — the field deployment is small, the team is one person, and the tests are short, but it is not a mature CI/CD posture.

---

## 7. GDPR and Data Protection

The system processes personal data of a small number of named individuals (inspectors). It may also incidentally capture personal data of building residents (in background of photos, in voice narration, on visible signage). ASH Chartered Surveyors is the **Data Controller**.

### 7.1 Lawful basis

The lawful basis under UK GDPR Article 6(1) is intended to be:

- **Legitimate interests** (Article 6(1)(f)) — performance of the managing-agent role under existing lease and management agreements.
- Where inspections form part of an explicit contractual obligation to a freeholder or RTM company, **contract** (Article 6(1)(b)) may be the more accurate basis. This is a per-engagement determination that has not been formally documented per-property. *(Audit point: a single firm-wide statement is needed.)*

No special category data (Article 9) is intentionally processed.

### 7.2 Data categories

| Category | Source | Subjects | Sensitivity |
|---|---|---|---|
| Inspector identity | `public.users` table | 2 named inspectors | Standard |
| Inspector signature | Storage bucket | Same | Standard (handwriting) |
| Inspection date/time/duration | `inspections` | Inspector | Standard |
| Voice narration transcript | `observations.raw_narration` | Inspector (speaker); incidental third parties named in narration | Standard, occasionally elevated if a resident is named |
| Photographs of common areas | Storage bucket | Buildings; incidental third parties (residents in background, vehicle plates) | Standard, occasionally elevated |
| Property metadata | `properties` | Buildings (not natural persons) | Low |
| Bug reports | `bug_reports` | Inspector | Standard |
| AI usage telemetry | `api_usage_log` | Inspector (user_id linkage) | Standard, operational |

### 7.3 Data subject rights

- **Subject Access Request (Article 15):** No automated DSAR pipeline exists. A SAR would be fulfilled manually by Ben Graham extracting matching rows and storage objects.
- **Right to erasure (Article 17):** No formal erasure flow exists. Hard-delete via SQL is available to the admin but is not user-initiated.
- **Right to rectification (Article 16):** Inspectors can edit observation text indirectly (via reassignment / re-recording) before a report is generated. Post-generation, the report is immutable in storage.
- **Right to portability (Article 20):** Reports are produced as DOCX + PDF + HTML and emailed to the inspector. The data the inspector entered is therefore already in a machine-readable format in their possession.

*(Audit point: a documented DSAR procedure should be in place before any external party — including a leaseholder — could plausibly assert subject rights against the database.)*

### 7.4 Retention

- The intended retention period for inspection records is **6 years**, aligned with RICS Client Money Rule 4.7 analogues and the typical professional-indemnity tail.
- **This is not yet automated.** There is no scheduled deletion job. Reports remain in Supabase Storage indefinitely until manually removed.
- A soft-delete pattern (`is_active = false`, `deleted_at` timestamp) is documented in `CLAUDE.md` as the intended PropOS-aligned pattern, but the current inspection app uses hard-delete for `deleteInspection()` (only used during testing).

### 7.5 Cross-border transfers

The following processors are involved in routine data processing:

| Processor | Function | Location | Mechanism |
|---|---|---|---|
| Anthropic | LLM (Sonnet + Opus) | US | Subject to Anthropic's Trust Center DPA / SCCs |
| Deepgram | Voice transcription | US | Subject to Deepgram's DPA / SCCs |
| Resend | Outbound email | US (Cloudflare-backed) | Subject to Resend's DPA / SCCs |
| Supabase | Database + Storage + Auth | EU (intended `eu-west-2`) | Within UK adequacy if confirmed EU-region |
| Railway | App server hosting | US/EU per project setting | Subject to Railway DPA / SCCs |
| Open-Meteo | Weather | EU (Germany) | Public free API, no personal data sent |
| Nominatim (OpenStreetMap) | Geocoding | EU | Public free API, address only |

**No signed DPA exists yet between ASH Chartered Surveyors and the above processors.** Each provider publishes a standard DPA accessible via their Trust Center. *(Audit point: formal DPA acceptance / signature should be completed before go-live and added to ASH's processor register.)*

### 7.6 Data minimisation

- Photos are resized to max 2048 px on the longest edge before transmission to Anthropic vision, before DOCX embed, and before storage. This was originally implemented as a Resend 40 MB cap fix but has the side-effect of reducing identifying detail in any incidentally captured persons.
- Local photo files are auto-deleted from the inspector's device after a report has been successfully emailed (v0.2.3 onward). Photos remain in Supabase Storage for the retention period.
- Voice audio is transmitted to Deepgram for transcription, then discarded (no audio retention). Only the transcript is stored.

### 7.7 What is **NOT** in place

- No formal Data Protection Impact Assessment (DPIA) for high-risk processing. *(Argument for DPIA: incidental processing of resident personal data in photographs; argument against: large-scale or systematic monitoring is not occurring. A DPIA is recommended.)*
- No published Privacy Notice on the inspection app itself.
- No documented data-processor register at ASH covering the processors named in §7.5.
- No ICO registration check has been performed *for this system specifically* (ASH is registered with the ICO at the firm level; the question is whether this system materially changes that registration).
- No supplier-side DPAs signed (see §7.5).

---

## 8. Statutory and Safety Considerations

### 8.1 Regulatory framework

- **RICS regulation.** ASH Chartered Surveyors is regulated by RICS. The inspection reports carry a Regulation line in the Inspector Declaration block.
- **Lease/management context.** Inspections form part of routine block management. They are NOT statutory reports under any single Act.
- **Building Safety Act 2022, Regulatory Reform (Fire Safety) Order 2005, BS 9999, BS 8214, BS EN 1634** are explicitly **out of scope** of the current system. A separate Fire Door Inspection mode is on the roadmap (see §11) and would carry those statutory obligations when built.

### 8.2 Risk levels and timeframes

Every observation that generates an action carries one of three risk levels, mapped to timeframes the report communicates to the recipient:

| Risk | Timeframe | Intent |
|---|---|---|
| High | Within 5 working days | Immediate safety or legal risk |
| Medium | Within 30 days | Maintenance required |
| Low | Within 90 days | Minor defect |

These thresholds are encoded in `server/services/reportGenerator.ts` and are visible to the AI prompt that classifies each observation. The AI is instructed to assign a risk level conservatively.

### 8.3 Disclaimer language

Every generated report carries (verbatim, in the footer):

> "This report has been prepared by ASH Chartered Surveyors in its capacity as managing agent. Observations are made during a visual inspection of accessible common areas only and do not constitute a structural survey. Where specialist investigation is recommended, this should be carried out by an appropriately qualified professional."

### 8.4 Safety-critical UX decisions

The following are explicitly documented in `CLAUDE.md` as decisions made on safety grounds:

- **Lifts are NEVER auto-marked N/A**, even when the property feature flag `has_lift = false`. The inspector must explicitly confirm. This prevents a missing lift section in a property where someone has incorrectly flagged the building.
- **Roof access is not gated by a feature flag.** The roof section can be filled from ground-level observation even on properties where physical roof access is denied. Excluding the section on a flag would hide visible defects.
- **Inline error UI, not OS `alert()`.** Failed recordings, classification errors, and report failures surface in-screen rather than via focus-stealing alerts that could be missed.
- **Tap-to-record, not hold-to-record.** Inspectors need both hands free to point at defects while narrating.

### 8.5 Lone-worker considerations

Inspections are conducted by a sole inspector inside residential buildings. The current system has **no lone-worker safety feature** (no man-down alert, no check-in timer, no panic button). This is acknowledged. The risk control sits at the firm-policy level (Ben/Pete operate during business hours and notify each other of site visits) and is outside the app's responsibility.

The app does enable `KeepAwake.keepAwake()` while an inspection is active to prevent the phone going to sleep mid-recording, which has the secondary effect of keeping the device responsive if the inspector needs to make an emergency call.

### 8.6 Accessibility

The app uses standard React Native Web semantics with Tailwind styling. There has been **no formal WCAG audit**. Touch targets are sized to a minimum of 36×36 px in most controls. The app is intended for sighted inspectors using a phone, not for assistive-technology users — but this has not been certified.

---

## 9. AI and Generation Methodology

### 9.1 Is there a RAG system?

In the strict technical sense, **no**. The system does not use vector embeddings, a vector database, retrieval over a document corpus, or any form of nearest-neighbour lookup. The audit team should not be misled by colloquial use of "RAG" to describe LLM-using systems generally.

What the system does use is:

- **Direct prompting with structured context.** Each AI call receives a tightly-scoped, hand-crafted prompt with explicit context (property name and reference for autocorrect; previous-inspection actions for recurring-item detection; per-section photo descriptions for synthesis). No external corpus is "retrieved" — the relevant data is fetched from Postgres at call time and injected into the prompt.
- **LLM classification.** Section classification is a constrained-output LLM call that returns a JSON object describing one of 12 known sections.
- **LLM image analysis.** Photos are described by Opus 4.6 with a system prompt covering structure (description, notable issues, suggested caption, section_key).
- **LLM text processing.** Voice narrations are processed by Sonnet into professional prose with risk-level extraction.
- **LLM duplicate detection.** Within each section, Sonnet identifies photos that show the same subject so the report body doesn't display six near-identical photos in a row.

### 9.2 Model routing

A hard rule encoded in `server/config/models.ts`:

| Use case | Model |
|---|---|
| Photo / image analysis | `claude-opus-4-6` |
| All text tasks (classification, processing, summary, recurring, dedup) | `claude-sonnet-4-6` |

Opus is reserved for image work where visual understanding is necessary; Sonnet handles all text. No other models are used.

### 9.3 AI cost discipline

Every Anthropic API call is logged to `api_usage_log` with cost in USD (computed from token counts). The admin dashboard shows running totals. As of the date of this specification, AI cost per inspection averages well under £0.20.

### 9.4 Failure modes and guarantees

- **AI classification failure** → observation defaults to the `additional` section. The inspection always continues.
- **AI photo analysis failure** → photo is stored but `opus_description` remains null. A late-analysis retry runs at report generation time.
- **AI duplicate-detection failure** → report falls back to "show all photos in every section". Cosmetic degradation only.
- **AI summary failure** → fallback string: *"Overall condition summary could not be generated automatically. Please review the observations and actions recorded below."*
- **AI synthesis failure** (photo-only section) → section is omitted from the report body but photos still appear in the appendix.

None of these failures abort the report. The inspector always receives *something*.

### 9.5 No PII training

Anthropic, Deepgram, and Resend's standard data-processing terms specify that data sent via API is not used to train their models. *(Audit point: explicit acceptance of these terms in writing is part of the DPA gap noted in §7.5.)*

---

## 10. Open Items and Known Risks

This section is exhaustive and honest. Items here are known to the development team and are not yet closed.

### 10.1 Verification gaps (must close before go-live)

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Confirm Supabase project is in `eu-west-2` (UK/EU region) — required for UK GDPR adequacy without extra mechanisms | Ben Graham | Open |
| 2 | Confirm Railway region matches UK/EU expectations | Ben Graham | Open |
| 3 | Upgrade Supabase to a paid tier to enable Point-in-Time Recovery and verified backup cadence | Ben Graham | Open |
| 4 | Run a backup-restore drill end-to-end | Ben Graham | Open |
| 5 | Sign / formally accept DPAs with Anthropic, Deepgram, Resend, Supabase, Railway | Ben Graham + ASH partners | Open |
| 6 | Add ASH Privacy Notice covering this system | ASH partners | Open |
| 7 | Document data-processor register at the firm level | ASH partners | Open |
| 8 | Decide whether a DPIA is needed; if yes, complete one | Ben Graham + ASH partners | Open |

### 10.2 Technical debt (acceptable for current scale; flagged for PropOS migration)

- RLS policies use implicit `WITH CHECK` (USING-as-WITH-CHECK fallback). Will be made explicit during PropOS schema migration.
- Migrations are applied via the Supabase SQL editor manually, not via the Supabase CLI. Will be migrated to CLI-managed when PropOS adoption begins.
- The system is single-firm. `firm_id` multi-tenancy is documented but not implemented.
- The `role` column on `public.users` is read on every protected route (an extra DB round-trip per request). PropOS will move this to a JWT claim via a `SECURITY DEFINER` custom-access-token hook.

### 10.3 Data hygiene before go-live

- All current inspections, observations, photos, and `api_usage_log` rows are test data and will be **truncated** before go-live. `users` and `properties` will be retained.
- All photos in Supabase Storage `inspection-files/<property_id>/...` will be cleared before go-live.
- The `signatures/<user_id>.png` path is the only storage data that will persist into go-live (it represents the inspector's signed declaration, captured during their first login).

### 10.4 Out-of-scope items (deferred by design)

- iOS support (no macOS / Xcode machine available; not in current ASH device fleet).
- Google Play Store listing (in-app updater covers OTA; Play Store listing is optional and currently deferred).
- Fire-door / Building-Safety-Act inspection mode (Phase 7+; described in `CLAUDE.md`).
- In-app action-item tracking (reassigned to PropOS).

---

## 11. Roadmap

Concise statement of where the project is going next.

1. **Stabilisation (current).** Field use of v0.2.3. Bug-squashing via the in-app feedback channel and the admin dashboard. No new feature work planned for the inspection app itself.
2. **Go-live preparation.** Close the §10.1 verification gaps. Wipe test data per §10.3. Add Privacy Notice and DPA acknowledgements.
3. **Fold into PropOS as an unbranded inspection module.** PropOS conventions (firm_id, JWT user_role claim, soft-delete, explicit WITH CHECK RLS) become applicable. The inspection app's standalone life ends; data flows feed PropOS dashboards.
4. **Future: Fire Door Inspection mode.** Second inspection type for Richard Smith's BSA / fire-safety workflow.
5. **Future: iOS.** Requires macOS + Xcode + Apple Developer account.

---

## 12. Repository Structure (for audit navigation)

```
ash-inspection-app/
├── app/                            # Android / web frontend (Capacitor + React)
│   ├── src/                        # TypeScript source
│   ├── android/                    # Capacitor Android project (signed APK output)
│   └── package.json                # Current version: 0.2.3
├── server/                         # Node + Express backend (Railway deployment)
│   ├── routes/                     # Per-endpoint route handlers
│   ├── services/                   # Domain logic (report builders, AI wrappers, email)
│   ├── middleware/                 # Auth, rate-limit
│   ├── prompts/                    # AI system prompts (one file per use case)
│   ├── config/models.ts            # SINGLE SOURCE OF TRUTH for AI model identifiers
│   └── tests/                      # node:test unit + integration suites
├── supabase/migrations/            # Numbered SQL migrations
├── CLAUDE.md                       # Developer guide / runbook
├── README.md                       # Repository overview
├── NEXT_SESSION.md                 # Working-session handover notes
└── audit/                          # This document and its covering letter
    ├── SPECIFICATION.md
    └── COVERING_LETTER.md
```

Repository: `https://github.com/randommonicle/ash-inspection-app` (private).

---

## 13. Contact

For follow-up questions, clarifications, or to request inspection of specific code paths or database rows:

**Ben Graham**
Senior Property Manager, ASH Chartered Surveyors
ben240689@proton.me

The development team will treat all auditor questions in good faith and will not edit the live codebase to suppress audit findings between the date of this document and the audit's conclusion.

— *End of Specification.*
