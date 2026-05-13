# ASH Inspection App — Developer Guide

**Last updated:** May 2026  
**Author:** Ben Graham, ASH Chartered Surveyors  
**Purpose:** This document is the single source of truth for anyone (human or AI) picking up this codebase. It covers setup, architecture, lessons learned, known issues, and future work. If Ben is unavailable, this document should be sufficient to continue development.

---

## ⚡ READ THIS FIRST — EVERY SESSION

**Step 1:** Are you on the **home computer** or **work computer**?  
**Step 2:** Are you doing **development** or preparing for a **field test**?

Then jump to the relevant section below before touching any code.

---

## What This App Does

ASH Chartered Surveyors (Cheltenham) inspect residential blocks monthly. Previously this was paper-based. This app replaces that process:

1. **Inspector opens the app** on their Android phone, selects a property
2. **Records voice narrations** for each area of the building — app transcribes and classifies them automatically into the correct report section
3. **Takes photos** — automatically linked to the last observation, analysed by AI, captioned
4. **Completes inspection** — data syncs to the cloud in the background
5. **Generates report** — one tap produces a branded Word document + PDF, emailed to the inspector

Reports match the existing ASH template exactly. The AI cleans up voice narrations into professional prose, assigns risk levels, flags recurring issues from the previous inspection, auto-fills weather from a free weather API, and sets a projected next inspection date.

**Current users:**  
- Pete Birch (inspector) — petebirchpm@proton.me  
- Ben Graham (developer/inspector) — ben240689@proton.me  
- Both have accounts in Supabase `users` table with role `inspector`

---

## Infrastructure Overview

| Service | Purpose | URL / Location |
|---------|---------|----------------|
| **Railway** | Production server (Express + LibreOffice) | `https://ash-inspection-app-production.up.railway.app` |
| **Supabase** | Database, auth, file storage | Project: `ash-inspection-app` |
| **Resend** | Transactional email | From: `reports@propertyappdev.co.uk` |
| **Cloudflare** | DNS for `propertyappdev.co.uk` | Free tier |
| **123-reg** | Domain registrar for `propertyappdev.co.uk` | DNS delegated to Cloudflare |
| **Deepgram** | Speech-to-text transcription | Called from the server (`POST /api/transcribe`) |
| **Anthropic** | AI (classification, summarisation, image analysis) | Called from the server only |
| **Open-Meteo** | Historical weather data | Free, no API key |
| **Nominatim** | Address geocoding (for weather lookup) | Free, OpenStreetMap, no API key |
| **GitHub** | Source control | https://github.com/randommonicle/ash-inspection-app |

**Railway auto-deploys on every `git push` to `main`.** No manual deploy step needed.

---

## Environment Variables

### `server/.env` (local dev — never committed)
```
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...         # Service role — bypasses RLS, server-side only
                                 # (SUPABASE_SERVICE_ROLE_KEY is accepted as an alias in .env.example)
DEEPGRAM_API_KEY=...              # Required — transcription is server-side
RESEND_API_KEY=...
ADMIN_PASSWORD=...                # /admin dashboard login (username always "admin")
REPORT_TO_OVERRIDE=...            # REMOVE IN PRODUCTION — forces all emails to one address
```

### Railway Variables (production — set in Railway dashboard)
Same keys as above, minus `REPORT_TO_OVERRIDE` once that's removed, plus the update-checker vars:
```
APP_VERSION=0.2.0                 # Latest released app version (semver)
APK_URL=https://github.com/randommonicle/ash-inspection-app/releases/download/v0.2.0/app-release.apk
RELEASE_NOTES=...                 # Short plain-text shown in the in-app update prompt
FORCE_UPDATE=false                # Set "true" to block use until update installed
```
These are read by `GET /api/version` — bumping them does NOT require a code redeploy.

### `app/.env.local` (never committed)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...       # Anon key — safe to expose, RLS enforces access
VITE_API_BASE_URL=https://ash-inspection-app-production.up.railway.app
# VITE_DEEPGRAM_API_KEY — REMOVED. Transcription now goes via POST /api/transcribe (server holds DEEPGRAM_API_KEY)
```

---

## Home Computer Setup (Ben's personal machine)

**Path:** `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\`

### Running the server locally
```
cd C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\server
npm run dev
```
Runs on `http://localhost:3001`. Keep this terminal open.

> ⚠️ **tsx watch + external editors**: tsx watch sometimes fails to detect saves made by Claude Code or other external editors. If server-side changes aren't reflected in the logs, **manually restart** with Ctrl+C → `npm run dev`.

> **Port stuck after crash?** Run `npm run restart` (kills port 3001 and restarts). If that fails:  
> `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -Force`

### Running the frontend dev server
```
cd C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\app
npm run dev
```
Runs on `http://localhost:5173`.

### Testing on Android device (home)
- Phone and PC must be on the same WiFi
- Kaspersky VPN and Firewall must be **disabled** for WiFi debugging
- After any code change: `npm run build` → `npx cap sync android` → Run in Android Studio
- If the local IP has changed (`ipconfig` to check), update `VITE_API_BASE_URL` in `app/.env.local` and rebuild

> **LibreOffice** — required for PDF generation. NOT installed on the home PC by default.  
> If testing PDF generation at home: install from https://www.libreoffice.org/download/libreoffice-still/  
> Without it, the server still generates and emails the DOCX but silently skips the PDF.

---

## Work Computer Setup

### Development only (same WiFi as phone)
1. Start server: `npm run dev` in `server/`
2. Confirm `VITE_API_BASE_URL` in `app/.env.local` points to the work PC's local IP
3. USB or WiFi debug via Android Studio

### Field test (production server — from 2 May 2026)
The app now points at Railway in production. **No Cloudflare tunnel needed.**
- Ensure `VITE_API_BASE_URL=https://ash-inspection-app-production.up.railway.app` in `app/.env.local`
- Build and install the app, take the phone and go

> The old Cloudflare tunnel setup (`cloudflared tunnel --url http://localhost:3001`) is obsolete now that Railway is live. Ignore any references to it in older notes.

---

## Project Structure

```
ash-inspection-app/
├── app/                              # React + TypeScript + Capacitor frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── RecordButton.tsx       # Tap-to-start/stop recorder with cancel + camera slots
│   │   │   ├── ObservationFeedItem.tsx # Single observation card in the feed (with "Change section" button)
│   │   │   ├── SectionPicker.tsx      # Modal for manually overriding a section
│   │   │   ├── PreReportChecklist.tsx # Pre-generation checklist modal (Phase 6, with inline reassignment)
│   │   │   ├── UpdatePrompt.tsx       # Bottom-sheet shown when /api/version reports a newer build
│   │   │   ├── BugReportModal.tsx     # In-app bug report submission
│   │   │   └── LoadingSpinner.tsx
│   │   ├── screens/
│   │   │   ├── ActiveInspectionScreen.tsx  # Main recording interface (non-blocking transcription queue)
│   │   │   ├── PropertyDetailScreen.tsx    # Property info + inspection history + report trigger + 3-state sync UI
│   │   │   └── PropertyListScreen.tsx      # Property list from Supabase
│   │   ├── services/
│   │   │   ├── sync.ts               # Background sync queue (SQLite → Supabase + photo upload)
│   │   │   ├── classify.ts           # Calls POST /api/classify
│   │   │   ├── transcription.ts      # Calls POST /api/transcribe (server proxies to Deepgram)
│   │   │   ├── report.ts             # Calls POST /api/generate-report
│   │   │   └── supabase.ts           # Supabase client (anon key)
│   │   ├── db/
│   │   │   └── database.ts           # All SQLite operations (inspections, observations, photos)
│   │   ├── hooks/
│   │   │   ├── useSync.ts            # Exposes sync status and triggerSync()
│   │   │   ├── useNetwork.ts         # Online/offline detection
│   │   │   └── useUpdateCheck.ts     # Polls /api/version on launch; returns updateInfo for UpdatePrompt
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx       # Supabase auth, profile loading, sign-out on cold start
│   │   └── types/
│   │       └── index.ts              # All shared types + SECTION_LABELS, SECTION_ORDER
│   ├── android/                      # Capacitor Android project (do not edit manually)
│   ├── capacitor.config.ts           # App ID, scheme, allowNavigation, allowMixedContent
│   └── .env.local                    # API keys — never committed
│
├── server/                           # Node.js + Express + TypeScript backend
│   ├── index.ts                      # Express app entry point, middleware, route mounting
│   ├── Dockerfile                    # Railway deployment — includes LibreOffice
│   ├── routes/
│   │   ├── classify.ts               # POST /api/classify — AI section classification
│   │   ├── analysePhoto.ts           # POST /api/analyse-photo — Opus image analysis
│   │   ├── transcribe.ts             # POST /api/transcribe — server-side Deepgram (raw audio body)
│   │   ├── generateReport.ts         # POST /api/generate-report — full pipeline
│   │   ├── version.ts                # GET  /api/version — public, env-var driven, update checker
│   │   ├── bugReport.ts              # POST /api/bug-report
│   │   └── admin.ts                  # GET  /admin dashboard + sub-APIs
│   ├── tests/
│   │   ├── unit.test.ts              # node:test, no network, ~340ms — run before commit
│   │   └── integration.test.ts       # node:test with real Anthropic API — run before deploy
│   ├── services/
│   │   ├── reportGenerator.ts        # Builds the Word document (docx library)
│   │   ├── email.ts                  # Sends report via Resend
│   │   ├── pdf.ts                    # DOCX → PDF via LibreOffice CLI
│   │   ├── imageProcessor.ts         # sharp-based photo resize for vision + DOCX embed
│   │   ├── weather.ts                # Geocode + Open-Meteo historical weather lookup
│   │   ├── anthropic.ts              # Opus image analysis wrapper
│   │   └── supabase.ts               # Supabase client (service role key)
│   ├── scripts/
│   │   └── backfill-photo-analysis.ts # One-shot backfill for photos with NULL opus_description
│   ├── prompts/
│   │   ├── classify.ts               # System prompt for section classification
│   │   ├── analyseImage.ts           # System prompt for Opus photo analysis
│   │   ├── processObservation.ts     # System prompt for narration → professional text
│   │   └── generateSummary.ts        # System prompt for overall condition summary
│   └── config/
│       └── models.ts                 # SINGLE SOURCE OF TRUTH for AI model names
│
└── supabase/
    └── migrations/                   # Run in order — check numbering before adding new ones
```

---

## Architecture: Key Rules

### 1. Model routing is a hard rule
**Defined only in `server/config/models.ts`. Never hardcode model names anywhere else.**

| Use case | Model |
|----------|-------|
| Photo / image analysis | `claude-opus-4-6` |
| Section classification | `claude-sonnet-4-6` |
| Observation processing | `claude-sonnet-4-6` |
| Overall summary | `claude-sonnet-4-6` |
| Recurring item comparison | `claude-sonnet-4-6` |

Opus is expensive — it's only justified for image analysis where visual understanding matters. All text tasks use Sonnet.

### 2. Offline-first
- All inspection data is written to SQLite first, regardless of network status
- Sync to Supabase happens after inspection completion, in the background
- If sync fails, data is not lost — it retries on next trigger
- **Generate Report** is only available after the inspection is synced (Supabase has the data the server needs)

### 3. Server holds all secrets
- Anthropic, Resend, Supabase service role key — server-side only
- Deepgram is called via the server (`POST /api/transcribe`) — the API key never reaches the frontend
- The app's Supabase client uses the **anon key** only — RLS enforces data access

### 4. Sections are the core data model
There are 12 fixed sections defined in `app/src/types/index.ts`:
```
external_approach → grounds → bin_store → car_park → external_fabric → roof →
communal_entrance → stairwells → lifts → plant_room → internal_communal → additional
```
Every observation has a `section_key`. The report generator uses this to group content. Sections gated by property flags (`has_car_park`, `has_lift`, `has_roof_access`) are omitted from the report automatically.

---

## Feature Deep-Dives

### Recording flow
- **Tap-to-start / tap-to-stop** model (not hold-to-record — inspectors need both hands)
- Max 60 seconds per recording
- Cancel × appears to the LEFT while recording; camera button stays visible on the RIGHT
- After transcription, AI classifies the narration into the correct section
- **Low confidence** → amber banner with the suggested section, user confirms or overrides
- **High confidence** → auto-saved with no prompt
- **Add more** → appends to the previous observation's narration, re-classifies, updates in-place

### AI classification confidence
`app/src/services/classify.ts` → `POST /api/classify`  
Returns `{ section_key, confidence: 'high'|'low', split_required, split_at? }`  
- If `split_required`, the transcript is split at `split_at` character index and each half classified separately
- Falls back to `additional` section on any error — the inspection always continues

### Sync flow
`app/src/services/sync.ts`  
1. `triggerSync()` called after `completeInspection()`
2. For each unsynced completed inspection:
   - Upsert inspection row to Supabase
   - Upsert all observations
   - Upload each photo to Supabase Storage (`inspection-files` bucket)
   - After each upload, call `POST /api/analyse-photo` → Opus analyses the image → saves `opus_description` JSON to `photos` table
3. Mark inspection `synced=1` in SQLite

**Supabase Storage RLS** — `inspection-files` bucket needs:
- `INSERT` policy for authenticated users (app uploads)
- `SELECT` policy for authenticated users (server downloads for Opus + report)
- If photos fail to upload with "violates row-level security" → check Supabase → Storage → Policies

### Report generation pipeline
`server/routes/generateReport.ts`  
POST `/api/generate-report` with `{ inspection_id }`

1. Fetch inspection + property (flags, address, units) + inspector (name, email, job_title) from Supabase
2. Fetch all observations; process unprocessed ones through Sonnet (raw narration → professional text + action + risk level). Saves back to Supabase so regeneration is fast.
3. Find most recent previous inspection; ask Sonnet which previous actions are still outstanding → "Recurring Items" table
4. **Concurrently:** generate overall summary (Sonnet) + fetch weather (Open-Meteo)
5. Compute projected next inspection (inspection date + 1 calendar month)
6. Download all photos from Supabase Storage; **resize each via `services/imageProcessor.ts`** (max 2048 px, JPEG q82) before either embedding in the DOCX or sending to Opus; run late Opus analysis on any photo that was missed during sync
7. Build Word document (`server/services/reportGenerator.ts`)
8. Upload `report.docx` to Supabase Storage
9. Update inspection `status → 'report_generated'`
10. Convert DOCX → PDF via LibreOffice (`server/services/pdf.ts`) — non-fatal if LibreOffice absent
11. Send email via Resend with both files attached

### Weather auto-fill
`server/services/weather.ts`  
- Geocodes property address via **Nominatim** (free, OpenStreetMap, no API key)
  - Must include a `User-Agent` header per Nominatim's terms
- Fetches hourly weather via **Open-Meteo** for the inspection date and local UK hour
  - Tries the forecast API first (covers past 14 days, no delay)
  - Falls back to ERA5 archive API (covers any historical date, ~5-day lag for recent data)
- Uses `start_hour` / `end_hour` parameters to fetch a single hour rather than a full day
- Converts UTC start_time to UK local time (handles BST/GMT correctly via `toLocaleString` with `timeZone: 'Europe/London'`)
- Returns a string like `"14°C, Partly cloudy, Light wind (12 km/h)"` or `null` on any failure
- Failure is always non-fatal — the report field shows `—` instead

### Pre-report checklist
`app/src/components/PreReportChecklist.tsx`  
Shown when "Generate Report" or "Regenerate Report" is tapped.
- Shows all 12 sections: ✓ green (has observations), ! amber (no observations), — grey (N/A)
- Sections with no observations show two buttons: **Edit** (returns to inspection screen with that section pre-selected) and **N/A** (marks it intentionally skipped)
- **Auto-N/A** on open: `car_park` if `has_car_park=false`, `additional` always (it's optional)
- **Lifts are NOT auto-N/A** even if `has_lift=false` — safety-critical, inspector must explicitly confirm
- "Generate Report →" button disabled until all sections are green or N/A
- N/A markings are session-only — not persisted. Sections with no observations simply don't appear in the report body.

**Edit section → jump back to inspection:**  
`PropertyDetailScreen` navigates to `/inspection/{id}` with `location.state.jumpToSection = sectionKey`.  
`ActiveInspectionScreen` reads `jumpToSection` from location state, pre-sets `currentSection`, and shows an amber indicator: *"⚠ Add observation for: [Section Name]"*.  
After recording, the indicator reverts to normal. Inspector uses the back button to return.

### Photo appendix
`server/services/reportGenerator.ts` → `buildPhotoAppendix()`  
- All photos grouped by section in a 3-column thumbnail grid at the end of the report
- Each section heading in the appendix is an `InternalHyperlink` pointing back to the body section
- Body section headings have `BookmarkStart` / `BookmarkEnd` anchors
- **In Word**: Ctrl+Click to follow internal hyperlinks (Word requires Ctrl — this is normal behaviour)
- **In PDF**: single-click works as expected

### Non-blocking transcription
`app/src/screens/ActiveInspectionScreen.tsx`  
Each recording gets a unique key pushed onto `processingItems: string[]` when transcription starts and filtered off in `finally`. The Record button is only disabled while *actively recording*, not while transcribing — so PMs can fire a second clip while the first is still being processed by Deepgram + Sonnet. The feed shows one spinner card per in-flight item. The "Complete inspection" button is disabled while the queue is non-empty.

### Checklist reassignment
`app/src/components/PreReportChecklist.tsx` → `onReassignObservation` prop  
When a section has no observations, the row shows a **Move** button alongside Edit and N/A. Tapping Move expands an inline picker listing every observation from other sections; tapping one reassigns it. Used both during an active inspection (from the per-observation "Change section" button) and from the pre-report checklist on PropertyDetailScreen.

**Important sync behaviour for synced inspections:**  
When the reassignment is triggered from the pre-report checklist (where the inspection is by definition already synced), `PropertyDetailScreen` must mark the inspection dirty (`markInspectionUnsynced`) and await `triggerSync()` before the user proceeds to Generate Report. Otherwise the server reads stale observation rows from Supabase. See `onReassignObservation` callback in `PropertyDetailScreen.tsx`.

### Sync progress indicator
`PropertyDetailScreen.tsx` shows a three-state row for inspections that are `status='completed'` but `synced=false`:
- **Syncing** — spinner + "Uploading observations & photos…"
- **Error** — red badge + Retry button (calls `triggerSync()`)
- **Offline** — neutral note if the network hook reports offline
A `syncTriggeredRef` fires sync once on screen mount; subsequent reassignments trigger their own sync passes.

### Bug-report lifecycle (May 2026)
`server/routes/bugReport.ts` accepts submissions from the in-app `BugReportModal` and emails the admin. `bug_reports` rows carry a full lifecycle: `status` (open / in_progress / fixed / wont_fix / duplicate), `resolution_notes`, `resolved_version`, `duplicate_of` (UUID self-FK), `updated_at` (touched by trigger on every UPDATE). Admin moves a report through the lifecycle from the `/admin` dashboard → Bug Reports tab → Edit button per row.

Once an admin marks a report `fixed` with notes + a version (e.g. `0.2.2`), the inspector sees it in their **My Reports** screen (`/my-reports`, [app/src/screens/MyReportsScreen.tsx](app/src/screens/MyReportsScreen.tsx)) with a green Fixed badge and the resolution text. Closing the loop without manual chasing.

`BugReportModal` queries the user's open + in_progress reports on mount and shows them above the form as a soft-dedup hint — "Is this the same issue?" with a link to My Reports. Doesn't block submission; just raises awareness.

RLS: `bug_reports_select_admin` (existing) + new `bug_reports_select_own` (reporter sees their own rows via the anon-key Supabase client). The admin dashboard uses the service-role key and bypasses both.

### In-app update checker
`app/src/hooks/useUpdateCheck.ts` + `app/src/components/UpdatePrompt.tsx` + `server/routes/version.ts`  
- App fetches `GET /api/version` on launch (after login) with an 8s timeout
- Compares `remote.version` against build-time `__APP_VERSION__` (injected by Vite from `package.json`) using a numeric semver compare
- If remote is newer, shows a bottom-sheet `UpdatePrompt`. Tapping Download calls `window.open(apkUrl, '_blank')` — opens a Chrome Custom Tab, Android download manager intercepts the APK, user accepts install
- Failures are silently swallowed — version check must never block app usage
- `forceUpdate=true` removes the dismiss button; use only for breaking schema changes
- `/api/version` is public (mounted before all auth routes) — env-var driven so updates ship without code redeploy

### Release signing (Android)
`app/android/app/build.gradle`  
- Keystore: `app/android/ash-inspection.jks` — RSA 2048-bit, alias `ash-inspection`, 10000-day validity
- Credentials live in git-ignored `app/android/local.properties` (also Dropbox-backed)
- `build.gradle` reads `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` via `rootProject.file('local.properties')`
- `versionCode` increments by 1 per release; `versionName` mirrors `app/package.json` "version" — bump both together
- **New machine setup:** copy `ash-inspection.jks` into `app/android/` and add the three credential lines to `local.properties`. Without these, `./gradlew assembleRelease` produces `app-release-unsigned.apk` instead of `app-release.apk`.

### Release process
1. Bump `app/package.json` "version" + `versionCode`/`versionName` in `app/android/app/build.gradle`
2. `cd app && npm run build && npx cap sync android`
3. `cd app/android && ./gradlew assembleRelease` (set `JAVA_HOME` first on Windows if not done)
4. Upload `app/android/app/build/outputs/apk/release/app-release.apk` to GitHub Releases as tag `vX.Y.Z`
5. In Railway → Variables: update `APP_VERSION`, `APK_URL`, `RELEASE_NOTES`
6. Railway auto-redeploys; apps see the new version on next launch
7. For the first push on each device, the APK must still be sent manually — the in-app prompt takes over from there

Current baseline: **v0.2.0** at `https://github.com/randommonicle/ash-inspection-app/releases/download/v0.2.0/app-release.apk`

### Testing infrastructure
`server/tests/`  
- **`unit.test.ts`** — `node:test`, zero network, ~340ms. 11 tests covering SECTION_LABELS/SECTION_ORDER integrity (regression cases for the meter_reads bug) and `buildReportDocx` smoke. Run with `npm run test:unit` before every commit.
- **`integration.test.ts`** — `node:test` + real Anthropic API. ~$0.0002/run. 6 tests asserting classification routes specific narrations to the right sections (e.g. meter readings → `meter_reads`, lift narratives → `lifts`). Run with `npm run test:integration` before deploy.
- Both use the project's existing `tsx` install via `--require ./node_modules/tsx/dist/cjs/index.cjs`. No mocks anywhere — *fix the code, never skip the test*.

---

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Supabase auth, property list |
| 2 | ✅ | Audio recording (tap-to-record), Deepgram transcription, SQLite, camera |
| 3 | ✅ | Sonnet AI classification, section picker, low-confidence banner |
| 4 | ✅ | Background sync queue, Supabase Storage photo upload, Opus image analysis |
| 5 | ✅ | Observation processing, AI summary, Word report (ASH template), Resend email |
| 5.5 | ✅ | First field test (1 May 2026), recurring items, PDF via LibreOffice, dual email, property autocorrect, photo appendix with bookmarks |
| 6 | 🔄 | Pre-report checklist ✅, weather auto-fill ✅, projected next inspection ✅, photo-only/photo-first synthesis ✅, non-blocking transcription ✅, checklist reassignment ✅, sync progress indicator ✅, in-app update checker ✅ (v0.2.0 released), unit + integration test suites ✅, release signing ✅, tap-to-fullscreen viewer ⬜, duplicate image grouping ⬜ |

---

## What Works Offline vs Online

| Feature | Offline | Online (Supabase only) | Needs server |
|---------|---------|----------------------|--------------|
| Login | ❌ | ✅ | — |
| Property list | ❌ | ✅ | — |
| Audio recording | ✅ | ✅ | — |
| Transcription (Deepgram) | ❌ | ✅ | — |
| AI classification | ❌ | ❌ | ✅ `/api/classify` |
| Save observations locally | ✅ | ✅ | — |
| Camera | ✅ | ✅ | — |
| Sync to Supabase | ❌ | ✅ | — |
| Photo upload | ❌ | ✅ | — |
| Opus photo analysis | ❌ | ❌ | ✅ `/api/analyse-photo` |
| Generate report | ❌ | ❌ | ✅ `/api/generate-report` |

**If classification fails** (server unreachable): observation is saved to `additional` section. Inspection continues — nothing is lost.

---

## Known Issues / Production Checklist

Search for `// TODO [PRODUCTION]:` in the codebase to find all flagged items.

- [x] **JWT authentication on all server routes** — `server/middleware/auth.ts` (May 2026)  
  All three routes now require a valid Supabase JWT in `Authorization: Bearer <token>`. App sends the token via `app/src/services/apiClient.ts`. Anonymous callers receive 401.

- [x] **Rate limiting** — `server/middleware/rateLimits.ts` (May 2026)  
  Global: 200 req/15 min/IP. Classify: 30/min. Photo analysis: 80/10 min. Report generation: 10/hour. Uses `express-rate-limit`. Returns 429 with JSON body.

- [x] **Request body size cap** — `server/index.ts` (May 2026)  
  `express.json({ limit: '50kb' })` — prevents oversized payloads before they reach route handlers.

- [x] **Ownership check on report generation** — `server/routes/generateReport.ts` (May 2026)  
  Verifies `inspection.inspector_id === req.userId`. Inspectors can only generate reports for their own inspections. Returns 403 otherwise.

- [x] **Ownership check on photo analysis** — `server/routes/analysePhoto.ts` (May 2026)  
  Verifies the photo's inspection belongs to the requesting user before running Opus. Returns 403 otherwise.

- [x] **Deepgram key in frontend bundle** — `server/routes/transcribe.ts` (May 2026)  
  Moved to `POST /api/transcribe`. Server holds `DEEPGRAM_API_KEY`. App calls its own backend with a Supabase Bearer token. `VITE_DEEPGRAM_API_KEY` removed from `app/.env.local`. Key is no longer in the APK bundle.

- [x] **CORS whitelist** — `server/index.ts` (May 2026)  
  No longer a wildcard. `ALLOWED_ORIGINS` allows the Railway URL plus Capacitor's `https://localhost` and `capacitor://localhost` schemes only.

- [x] **`allowNavigation` / `allowMixedContent`** — `app/capacitor.config.ts` (May 2026)  
  Removed. Capacitor config is now minimal: `appId`, `appName`, `webDir`, `androidScheme: 'https'`. Both legacy IP whitelist and HTTP fallback are gone.

- [ ] **Report header email** — `server/services/reportGenerator.ts`  
  Currently shows `ben@ashproperty.co.uk`. Replace with the firm's general enquiries address before client-facing use.

- [ ] **`REPORT_TO_OVERRIDE`** — Railway Variables + `server/services/email.ts`  
  If still set, all reports route to one address regardless of which inspector generated them. Remove from Railway Variables for per-inspector routing.

- [ ] **Property feature flag UX** — `app/src/components/PreReportChecklist.tsx`  
  When inspector marks a section N/A for the first time, prompt: *"Does this property have a [lift/car park]?"* If No → update `has_lift`/`has_car_park` on the Supabase `properties` record so future inspections pre-populate N/A automatically. Requires inspector write permission on those columns (RLS update needed). Note: `has_roof_access` is different — the roof section may still be inspectable from ground level even without physical access.

---

## Lessons Learned / Gotchas

These are hard-won from the build process. Read before starting any related work.

### Android / Capacitor

**Gradle proguard-android.txt removed in Gradle 9.2.0**  
When Android Studio auto-updated its Gradle plugin to 9.2.0, every `build.gradle` in `node_modules/@capacitor/*` and `node_modules/@capacitor-community/*` that referenced `getDefaultProguardFile('proguard-android.txt')` broke. The file was removed. Fix: replace with `proguard-android-optimize.txt` in every affected `build.gradle`. Files affected (may recur after `npm install`):
- `app/android/app/build.gradle`
- `node_modules/@capacitor/android/capacitor/build.gradle`
- `node_modules/@capacitor/app/android/build.gradle`
- `node_modules/@capacitor/camera/android/build.gradle`
- `node_modules/@capacitor/filesystem/android/build.gradle`
- `node_modules/@capacitor/network/android/build.gradle`
- `node_modules/@capacitor/preferences/android/build.gradle`
- `node_modules/@capacitor-community/sqlite/android/build.gradle`
- `node_modules/@capacitor-community/keep-awake/android/build.gradle`

These are `node_modules` files — they are not committed. If you run `npm install` again they will be overwritten. A permanent fix would be a Gradle init script or a `postinstall` patch script.

**Capacitor plugin version pinning**  
Capacitor 6 plugins must be pinned to their Capacitor 6 compatible versions. Blindly upgrading will break the build. Known pins in `app/package.json`:
- `@capacitor-community/keep-awake`: `^5.0.0` (v6 requires Capacitor 7+)
- `@capacitor/app`: `^6.0.0` (v8 requires Capacitor 7+)

**Always rebuild and reinstall for `.env.local` or source changes**  
The app is a compiled native binary. `npm run build` → `npx cap sync android` → reinstall via Android Studio is required for any change to take effect on device.

**tsx watch on Windows**  
`tsx watch` spawns child processes that don't die cleanly with Ctrl+C on Windows. Use `npm run restart` (which kills port 3001 before restarting) rather than Ctrl+C → `npm run dev`.

### docx library (server/services/reportGenerator.ts)

**BookmarkStart / BookmarkEnd argument order**  
The `docx` library v9+ uses: `new BookmarkStart(name: string, id: number)` — name first, id second. Getting this wrong causes a TypeScript error that says "number not assignable to string".

**BookmarkEnd takes a bare number**  
`new BookmarkEnd(id: number)` — not an object. The intuitive `new BookmarkEnd({ id })` fails.

**InternalHyperlink anchor must match BookmarkStart name exactly**  
`new InternalHyperlink({ anchor: 'section_lifts', children: [...] })` must match `new BookmarkStart('section_lifts', id)`. A mismatch produces a hyperlink that does nothing.

**Word requires Ctrl+Click for internal hyperlinks**  
This is standard Word behaviour, not a bug. In PDF (LibreOffice-converted), single-click works correctly.

### Image sizing — vision API and email caps (May 2026)

Two hard limits caught us in production with a newly-registered inspector whose phone produced larger JPEGs than the existing inspectors':

- **Anthropic vision: 5 MB base64 per image.** Photos over 5 MB are rejected with `image exceeds 5 MB maximum`. The error is fatal for that one image only, not the whole request, but it means no `opus_description` is ever stored.
- **Resend: 40 MB total per email (content + all attachments).** When raw 5–7 MB photos get embedded into the DOCX and we also attach a PDF copy, modern phone cameras blow past this cap on properties with 20+ photos. Resend returns `validation_error: Email content and attachment exceeded the size limit (40MB)` and the report email never sends.

**Mitigation:** `server/services/imageProcessor.ts` exposes `resizeForReport(buffer)` — sharp, max 2048 px on the longest edge, JPEG quality 82, EXIF-aware rotation. A 6 MB phone photo comes out around 400–800 KB. Applied in two places:

- `routes/analysePhoto.ts` — resize before sending to Anthropic vision (the per-photo auto-caption call at sync time)
- `routes/generateReport.ts` — resize immediately after Supabase download, then reuse the resized buffer for both late Opus analysis and DOCX embedding

If the resize itself throws (e.g. a non-image file slipped through), we fall back to the raw buffer with a `[REPORT] Resize failed` warning — better to risk one oversized photo than abort the whole report.

**Click-to-enlarge photo links** *(flagged, off by default)*  
`ENABLE_PHOTO_HYPERLINKS=true` in Railway Variables turns on per-photo hyperlinks in the report. Each photo gets a 10-year Supabase signed URL, wrapped around the ImageRun in the DOCX/PDF. Tapping a photo in the PDF opens the full-res image in a browser.

Reasons it's off by default:
- **Link rot on key rotation** — rotating `SUPABASE_SERVICE_KEY` invalidates every signed URL in every previously-sent report. There's no fix short of re-sending all old reports.
- **Archival dependency** — reports have a 6+ year legal lifespan. Embedded images survive forever; signed URLs depend on Supabase staying alive at the same project.
- **PDF zoom already works** — source photos are 2048 px; pinching/scrolling in Acrobat or any PDF viewer gives ~6× sharp zoom without leaving the document.

Turn on only if specific feedback calls out "I want to click photos for detail" (rather than the cosmetic "stretched" / "low-res" feedback, which was actually the 4:3 hardcode bug fixed in May 2026).

**Backfilling old photos:** photos that failed vision at capture time keep `opus_description = NULL` forever — late analysis only fires during a report generation. `server/scripts/backfill-photo-analysis.ts` is a standalone Node script that pulls every photo with a NULL description, resizes it, runs Opus, and saves the result. Usage:

```
cd server
npm run backfill-photos -- <inspection_id>     # one inspection
npm run backfill-photos -- --all                # every photo with NULL across the DB
```

Runs locally against production Supabase via the service-role key in `server/.env`. Costs ~$0.05/photo (one Opus call each).

### Weather API (server/services/weather.ts)

**Nominatim requires a User-Agent header**  
Without it, Nominatim will rate-limit or block requests. The header must identify the application. Failure to include it is a terms-of-service violation.

**Open-Meteo `start_hour` / `end_hour` parameters**  
Use these to fetch a single hour instead of a full day — much faster and avoids parsing array indices. Format: `YYYY-MM-DDTHH:00` in the timezone specified by the `timezone` parameter.

**UTC → UK local time conversion**  
`startTime` from Supabase is stored in UTC. Open-Meteo with `timezone=Europe/London` returns times in UK local time (handles BST/GMT automatically). You must convert the UTC hour to UK local hour before building the `start_hour` parameter. Use `toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false })`.

**ERA5 archive has a ~5-day lag**  
The Open-Meteo archive API doesn't have data for the last ~5 days. The forecast API (with `past_days=14`) covers recent inspections. The code tries forecast first, falls back to archive. Both can fail — the field just shows `—` gracefully.

### Railway / Docker

**Dockerfile must be in the directory set as Railway's Root Directory**  
When the Dockerfile is in `server/` and Railway's Root Directory is set to `server`, it works. If Root Directory is left as the repo root, Railway looks for a Dockerfile there and fails. Set Root Directory in Railway → Settings → Source.

**All environment variables must be set in Railway Variables before first deploy**  
The server crashes on startup if `SUPABASE_URL` etc. are missing (they're read at module load time). Set all vars in the Railway dashboard before pushing the first deployment.

### Supabase

**`auth.users` vs `public.users` are separate**  
Supabase has two user tables. `auth.users` is the authentication table (managed by Supabase). `public.users` is our application profile table (with `full_name`, `email`, `job_title`, `role`). When adding or updating a user, you must update both: create in `auth.users` via the Supabase Auth dashboard, then add a corresponding row to `public.users` with the same `id`.

**Service role key vs anon key**  
The server uses the service role key (bypasses RLS — can read/write anything). The app uses the anon key (subject to RLS). Never put the service role key in the app.

### DNS / Email

**123-reg DNS UI can't handle long TXT records**  
The DKIM TXT record that Resend requires is very long and causes a "serverError" in 123-reg's DNS management UI. Fix: delegate DNS to Cloudflare (free) — Cloudflare handles long TXT values without issue.

**Resend domain verification is not automatic**  
After adding DNS records in Cloudflare, you must click "Verify" in the Resend dashboard. DNS propagation can take up to 24 hours; Resend shows the status.

---

## Phase 6 — Remaining Planned Work

**Tap-to-fullscreen photo viewer**  
Tapping a photo thumbnail in `ActiveInspectionScreen` or in the feed item opens it full-screen with the Opus caption. Low effort, improves usability.

**Duplicate image grouping** (`server/routes/generateReport.ts`)  
If Opus identifies multiple photos of the same subject (via description similarity), keep one in the section grid and move duplicates to the appendix only. Prevents the same wall/defect appearing six times in one section.

**Property feature flag first-time prompt** (see TODO in checklist above)  
When a section is marked N/A in the pre-report checklist for the first time on a property, ask: *"Does this property have a [lift/car park]?"* → update `has_lift`/`has_car_park` in Supabase properties. Needs RLS update.

**Scheduling view** (future)  
Dashboard showing all properties with their projected next inspection dates in a calendar view. Useful once more properties are added.

**Inspector signature** (future)  
Option A: stored signature image applied automatically. Option B: inspector signs on phone at report generation.

**PDF workflow improvement** (future)  
Inspector edits DOCX in Word if needed → re-uploads → server converts to PDF and re-emails.

**iOS support** (future)  
Requires macOS + Xcode + Apple Developer account. Not in scope until Android is proven in production.

---

## PropOS Engineering Conventions (already applied here)

This codebase shares engineering conventions with the sibling **PropOS** project (`C:\Users\bengr\OneDrive\Desktop\PropOS`). When the inspection app folds into PropOS as an unbranded module, these conventions reduce migration friction.

**Code-level rules currently followed:**
- **Single source of truth for AI model names** — `server/config/models.ts`. PropOS uses `ANTHROPIC_RUNTIME_MODEL` env var; ASH equivalent if needed for runtime swap.
- **`FORWARD: PROD-GATE` marker** at every PoC compromise. Grep this string across the repo for the full manifest of items to remove before going client-facing. Currently flags: `REPORT_TO_OVERRIDE` (server/services/email.ts).
- **Inline errors, not `alert()`** — `RecordButton.tsx` uses an inline red banner for mic-permission failure rather than a focus-stealing OS alert.
- **Stage-tagged pipeline errors** — `/api/generate-report` returns `{ok:false, stage, message}`. The app's `ReportError` class preserves the stage so the UI can say *"failed while building the report document"* not *"report failed"*. Mirror this pattern in any future multi-step route.
- **Real services in tests, no mocks** — unit tests use real `buildReportDocx`; integration tests hit the real Anthropic API. PropOS rule: *fix the code, never skip the test*.
- **Ownership re-checks in handlers** — every route that mutates inspection data verifies `inspection.inspector_id === req.userId` after fetching the row (defence-in-depth even with RLS).

**To apply when folding into the PropOS ecosystem:**

1. **Multi-tenancy via `firm_id`** — currently single-firm (ASH). Add `firm_id UUID` to `properties`, `users`, `inspections`, `observations`, `photos`, `pm_roster`, `bug_reports`, `api_usage_log`. Scope every RLS policy to `firm_id = auth_firm_id()`. Backfill ASH's existing rows with the ASH firm UUID before the migration is applied in production.

2. **JWT claims pattern** — PropOS uses a `SECURITY DEFINER` custom-access-token hook that injects `user_role` and `firm_id` into the JWT. **Never overwrite the `role` claim** — PostgREST uses it to pick the Postgres role. Currently ASH reads `role` from `public.users` table on every request; switch to JWT claim to remove that round-trip.

3. **Explicit `WITH CHECK` on RLS policies** — current policies use `FOR ALL USING (...)` without `WITH CHECK`. Postgres falls back to USING-as-WITH-CHECK so this is functionally correct, but PropOS rule is explicit-for-code-review. Add `WITH CHECK` to all 4 `FOR ALL` policies (`inspections_all_own`, `observations_all_own`, `photos_all_own`) and the one `FOR UPDATE` (`properties_update_admin`, `users_update_own`) in a single migration when joining.

4. **Audit-log tables append-only at RLS** — when adding an inspection audit log (who generated which report, when), make it SELECT + INSERT policies only; no UPDATE or DELETE. PropOS uses CHECK constraints to enforce coherent stamps (e.g. `(authorised_at IS NULL) = (authorised_by IS NULL)`).

5. **Soft-delete pattern** — currently `deleteInspection()` hard-deletes. When PropOS adopts this module, switch to `is_active=false` + `deleted_at` stamp because regulated workflows need 6-year retention (RICS Client Money Rule 4.7 analogue).

6. **Unbranded mode** — the report header, email subject, and `from` address hardcode "ASH Chartered Surveyors" / `reports@propertyappdev.co.uk`. When the module ships under PropOS, route these through a per-firm config: `firms.report_header_html`, `firms.email_from_address`, `firms.report_template_id`. Add `firms.is_demo` from day one (per PropOS convention) so demo-vs-prod branching has a home.

7. **Repurpose `/admin` dashboard** — currently single-firm. Either fold the live-inspections view into PropOS's existing dashboard or scope it to the current `auth_firm_id()` and namespace under `/firms/{slug}/admin`.

8. **Supabase region** — confirm the ASH Supabase project is in `eu-west-2` (UK) for GDPR. PropOS pins this from day one. If ASH is elsewhere, migration is non-trivial — plan early.

---

## Future Roadmap — Fire Door & Safety Inspection Mode

**Background:** Richard Smith (partner, direct line manager) handles fire door inspections, Building Safety Act compliance, and HSE matters. The idea is to extend the existing app to support a second inspection type for him rather than building a separate app. Half the logic is already present.

### Why combine rather than separate
- Auth, recording, transcription, photo upload, offline sync, and report pipeline are identical
- Richard could cover PM inspections during sickness if he has a dual role
- New property onboarding (see below) benefits from shared infrastructure
- Single codebase to maintain, single Railway deployment

### What would be new
- **`inspection_type` field** on the `inspections` table (`pm | fire_door | property_survey`)
- **`role` array** on users (`inspector | fire_inspector | admin`) — Richard gets `fire_inspector`, existing PMs keep `inspector`
- **Theme system** — `useTheme()` hook driven by the logged-in user's primary role. Red backgrounds/accents for `fire_inspector`, existing navy for `inspector`. Shared layout components, only colours change.
- **Section template abstraction** — `getTemplate(inspectionType)` returns the correct section config. Current 12-section PM walkthrough becomes one template; fire door sections are a separate config (per-door: unique door ID, pass/fail, defect categories — frame, leaf, intumescent seals, closer, signage, hold-open devices, etc.)
- **AI classification prompts** — the `/api/classify` endpoint needs to know the inspection type so it routes narrations to the correct sections
- **Fire door report template** — separate Word template with door-by-door schedule, remediation timescales (immediate / 24hr / 28 days), statutory references (Regulatory Reform (Fire Safety) Order 2005, BS 9999, BS 8214, Building Safety Act 2022), responsible person sign-off block

### New property onboarding mode
A lightweight third inspection type (`property_survey`) where Richard (or any inspector) walks a new building and records its attributes — number of floors, lift present, car park, fire door count, accessibility features, etc. Output populates the Supabase `properties` record and generates a property data sheet for distribution to PMs. No major new logic needed; just a different section template and report format.

### Recommended implementation order (when the time comes)
1. Add `inspection_type` to `inspections` table and `role[]` to `users` table in Supabase
2. Abstract section definitions into `app/src/config/templates/` — `pm.ts`, `fire_door.ts`, `property_survey.ts`
3. Add `useTheme()` context and thread it through shared components
4. Update `/api/classify` to accept and use `inspection_type`
5. Add fire door report template to `server/services/reportGenerator.ts`
6. Add Richard's account in Supabase with `role: ['fire_inspector']`

### Statutory requirements to factor into the fire door template
- **Regulatory Reform (Fire Safety) Order 2005** — responsible person must ensure fire doors are maintained
- **Building Safety Act 2022** — heightened requirements for higher-risk buildings (18m+ or 7+ storeys)
- **BS 9999:2017** — fire safety in the design of buildings
- **BS 8214:2016** — timber-based fire door assemblies
- **BS EN 1634** — fire resistance and smoke control testing
- Each defect needs a remediation priority: **Immediate** (door non-functional), **24 hours** (significant compromise), **28 days** (minor defects)

---

## Server Management

**Health check:** `https://ash-inspection-app-production.up.railway.app/health` → `{"ok":true}`  
**Logs:** Railway dashboard → ash-inspection-app → Deployments → View logs  
**Env vars:** Railway dashboard → ash-inspection-app → Variables  
**Redeploy:** Automatic on `git push origin main`

**Local server:**
```
cd C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\server
npm run dev        # normal start
npm run restart    # kills port 3001 then restarts (use after crashes)
```
