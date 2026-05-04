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
| **Deepgram** | Speech-to-text transcription | Called directly from the app (security debt — see TODO list) |
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
SUPABASE_SERVICE_ROLE_KEY=...    # Service role — bypasses RLS, server-side only
DEEPGRAM_API_KEY=...
RESEND_API_KEY=...
REPORT_TO_OVERRIDE=...           # REMOVE IN PRODUCTION — forces all emails to one address
```

### Railway Variables (production — set in Railway dashboard)
Same keys as above, minus `REPORT_TO_OVERRIDE` once that's removed.

### `app/.env.local` (never committed)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...       # Anon key — safe to expose, RLS enforces access
VITE_API_BASE_URL=https://ash-inspection-app-production.up.railway.app
VITE_DEEPGRAM_API_KEY=...        # TODO: move to server (see security TODOs)
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
│   │   │   ├── ObservationFeedItem.tsx # Single observation card in the feed
│   │   │   ├── SectionPicker.tsx      # Modal for manually overriding a section
│   │   │   └── PreReportChecklist.tsx # Pre-generation checklist modal (Phase 6)
│   │   ├── screens/
│   │   │   ├── ActiveInspectionScreen.tsx  # Main recording interface
│   │   │   ├── PropertyDetailScreen.tsx    # Property info + inspection history + report trigger
│   │   │   └── PropertyListScreen.tsx      # Property list from Supabase
│   │   ├── services/
│   │   │   ├── sync.ts               # Background sync queue (SQLite → Supabase + photo upload)
│   │   │   ├── classify.ts           # Calls POST /api/classify
│   │   │   ├── transcription.ts      # Calls Deepgram directly (TODO: move to server)
│   │   │   ├── report.ts             # Calls POST /api/generate-report
│   │   │   └── supabase.ts           # Supabase client (anon key)
│   │   ├── db/
│   │   │   └── database.ts           # All SQLite operations (inspections, observations, photos)
│   │   ├── hooks/
│   │   │   ├── useSync.ts            # Exposes sync status and triggerSync()
│   │   │   └── useNetwork.ts         # Online/offline detection
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
│   │   └── generateReport.ts         # POST /api/generate-report — full pipeline
│   ├── services/
│   │   ├── reportGenerator.ts        # Builds the Word document (docx library)
│   │   ├── email.ts                  # Sends report via Resend
│   │   ├── pdf.ts                    # DOCX → PDF via LibreOffice CLI
│   │   ├── weather.ts                # Geocode + Open-Meteo historical weather lookup
│   │   ├── anthropic.ts              # Opus image analysis wrapper
│   │   └── supabase.ts               # Supabase client (service role key)
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
- Deepgram is currently called directly from the frontend (known security debt — see TODO list)
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
6. Download all photos from Supabase Storage; run late Opus analysis on any photo that was missed during sync
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
| 6 | 🔄 | Pre-report checklist ✅, weather auto-fill ✅, projected next inspection ✅, tap-to-fullscreen viewer ⬜, duplicate image grouping ⬜ |

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

- [ ] **Deepgram key in frontend bundle** — `app/src/services/transcription.ts`  
  Move to `POST /api/transcribe` backend route. Add `DEEPGRAM_API_KEY` to server env. Remove `VITE_DEEPGRAM_API_KEY` from `app/.env.local`. Until then, the Deepgram key is exposed in the compiled JS.

- [ ] **CORS wildcard** — `server/index.ts`  
  Replace `cors()` with `cors({ origin: ['https://app.ashproperty.co.uk'] })` before exposing the server to the public internet.

- [ ] **`allowNavigation` IP whitelist** — `app/capacitor.config.ts`  
  Still contains `192.168.1.108` (home dev IP). For production, replace with the Railway domain. Currently harmless — the IP is only used in local dev when `VITE_API_BASE_URL` points to it.

- [ ] **`allowMixedContent`** — `app/capacitor.config.ts`  
  Set to `true` to allow the HTTPS app shell to call HTTP local endpoints during development. Safe to leave as-is since Railway is HTTPS, but should be removed when local dev is no longer needed.

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

**Deepgram → server-side transcription** (security)  
Move `POST /api/transcribe` to the server to remove the Deepgram key from the app bundle.

**Inspector signature** (future)  
Option A: stored signature image applied automatically. Option B: inspector signs on phone at report generation.

**PDF workflow improvement** (future)  
Inspector edits DOCX in Word if needed → re-uploads → server converts to PDF and re-emails.

**iOS support** (future)  
Requires macOS + Xcode + Apple Developer account. Not in scope until Android is proven in production.

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
