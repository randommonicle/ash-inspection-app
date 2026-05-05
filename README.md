# ASH Inspection App

A mobile-first property inspection tool for ASH Chartered Surveyors. Property managers walk a block, dictate voice observations on an Android phone, and receive a fully formatted, branded Word + PDF report by email within minutes of finishing the inspection.

Built by Ben Graham. If you are picking this up for the first time, read this entire file — it covers everything from local setup to production deployment to the iOS rollout plan.

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Prerequisites and Accounts](#3-prerequisites-and-accounts)
4. [Repository Structure](#4-repository-structure)
5. [Local Development Setup](#5-local-development-setup)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Database: Supabase](#7-database-supabase)
8. [Building and Installing the Android APK](#8-building-and-installing-the-android-apk)
9. [Field Testing Over Mobile Data (Cloudflare Tunnel)](#9-field-testing-over-mobile-data-cloudflare-tunnel)
10. [Production Deployment (Railway)](#10-production-deployment-railway)
11. [Admin Dashboard](#11-admin-dashboard)
12. [AI Model Routing and Costs](#12-ai-model-routing-and-costs)
13. [Report Generation Pipeline](#13-report-generation-pipeline)
14. [Inspection Sections Reference](#14-inspection-sections-reference)
15. [iOS Rollout Plan and Costings](#15-ios-rollout-plan-and-costings)
16. [Pre-Production Checklist](#16-pre-production-checklist)
17. [Key Files Reference](#17-key-files-reference)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. What It Does

1. A property manager opens the app, selects a property, and starts an inspection.
2. They walk around the building, tapping a record button to dictate an observation for each area they inspect. Deepgram transcribes the speech in real time.
3. The server classifies each observation into the correct report section using Claude Sonnet.
4. Observations are stored locally in SQLite on the device so the app works with no signal.
5. The PM takes photos as they go. Photos are associated with observations or left unlinked.
6. When the inspection is complete, all data syncs to Supabase. Photos are analysed by Claude Opus to generate descriptions and captions.
7. Back at the office, the PM taps "Generate Report". The server processes all observations into professional prose, identifies recurring maintenance issues from the previous inspection, generates a condition summary, builds a branded Word document, converts it to PDF, and emails both to the inspector.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Android Device (Capacitor 6 + React 18 + SQLite)               │
│                                                                  │
│  ┌──────────────────┐   ┌──────────────────┐                    │
│  │ Active Inspection │   │ Property Detail  │                    │
│  │ - Record button   │   │ - Inspection list│                    │
│  │ - Observation feed│   │ - Generate Report│                    │
│  │ - Camera capture  │   │ - View/share DOCX│                    │
│  └────────┬─────────┘   └────────┬─────────┘                    │
│           │ Deepgram WS (direct)  │ HTTP to server               │
└───────────┼───────────────────────┼──────────────────────────────┘
            │                       │
            ▼                       ▼
  ┌──────────────────┐    ┌──────────────────────────────────────┐
  │  Deepgram API    │    │  Express Server (Railway)            │
  │  (Nova-3 STT)    │    │                                      │
  └──────────────────┘    │  POST /api/classify     (Sonnet)     │
                          │  POST /api/analyse-photo (Opus)      │
                          │  POST /api/generate-report (Sonnet)  │
                          │  POST /api/bug-report                │
                          │  GET  /admin  (dashboard)            │
                          │                                      │
                          │  ┌────────────────────────────────┐  │
                          │  │  Supabase (PostgreSQL + Storage)│  │
                          │  │  - inspections, observations   │  │
                          │  │  - photos, users, properties   │  │
                          │  │  - api_usage_log               │  │
                          │  │  - Storage: DOCX + photos      │  │
                          │  └────────────────────────────────┘  │
                          │                                      │
                          │  Anthropic API  │  Resend API        │
                          └──────────────────────────────────────┘
```

**Key design decisions:**

- **Offline-first:** All observations and photos are persisted to SQLite on-device first. Sync to Supabase happens in the background. The inspection continues uninterrupted even with no signal.
- **Auth requires re-login on cold start:** `AuthContext.tsx` clears the session whenever the app starts fresh. This prevents leaving an inspector logged in on a shared device.
- **Server is stateless:** All persistent state lives in Supabase. The server can be restarted or redeployed at any time without data loss.
- **Photos are analysed on sync, not at capture time:** Opus analysis is triggered when photos sync to Supabase, not during the inspection. This keeps the inspection flow fast and avoids wasting credits if photos are deleted.

---

## 3. Prerequisites and Accounts

### Local tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20 | Server and app build |
| npm | ≥ 10 | Package management |
| Android Studio | Ladybug+ | APK build and device install |
| Java JDK | 17 | Required by Gradle (Capacitor) |

> **JAVA_HOME issue on Windows:** If `gradlew assembleDebug` fails with "JAVA_HOME is not set", run:
> ```
> set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
> ```
> Then retry. This needs to be set each new terminal session, or add it to system environment variables permanently.

### Third-party accounts (all required)

| Service | What it does | Where to get it |
|---------|-------------|----------------|
| **Supabase** | PostgreSQL database, auth, and file storage | supabase.com |
| **Anthropic** | Claude AI — classification, photo analysis, report text | console.anthropic.com |
| **Deepgram** | Real-time speech-to-text (Nova-3 model) | console.deepgram.com |
| **Resend** | Transactional email delivery (reports sent to PMs) | resend.com |

---

## 4. Repository Structure

```
ash-inspection-app/
│
├── app/                          React 18 + Vite + Capacitor 6 (Android)
│   ├── src/
│   │   ├── screens/              One file per full-screen view
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   ├── PropertyListScreen.tsx
│   │   │   ├── PropertyDetailScreen.tsx
│   │   │   └── ActiveInspectionScreen.tsx  ← main inspection UI
│   │   ├── components/           Reusable UI components
│   │   │   ├── RecordButton.tsx
│   │   │   ├── ObservationFeedItem.tsx
│   │   │   ├── SectionPicker.tsx
│   │   │   ├── PreReportChecklist.tsx
│   │   │   ├── BugReportModal.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── db/
│   │   │   └── database.ts       SQLite schema and all local CRUD
│   │   ├── services/
│   │   │   ├── apiClient.ts      HTTP wrapper for all server calls
│   │   │   ├── sync.ts           Background sync queue (obs + photos)
│   │   │   └── ...
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx   Auth state — clears on cold start
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useNetwork.ts
│   │   │   └── useSync.ts
│   │   └── types/
│   │       └── index.ts          All TypeScript types and section constants
│   ├── android/                  Capacitor-generated Android project (do not edit by hand)
│   ├── capacitor.config.ts       App ID, server URL for native
│   └── package.json
│
├── server/                       Node.js + Express backend
│   ├── routes/
│   │   ├── classify.ts           POST /api/classify
│   │   ├── analysePhoto.ts       POST /api/analyse-photo
│   │   ├── transcribe.ts         POST /api/transcribe (audio → text)
│   │   ├── generateReport.ts     POST /api/generate-report  ← main pipeline
│   │   ├── bugReport.ts          POST /api/bug-report
│   │   └── admin.ts              GET  /admin (dashboard + sub-APIs)
│   ├── services/
│   │   ├── anthropic.ts          Anthropic SDK wrapper (classify + analyseImage)
│   │   ├── reportGenerator.ts    Word document builder using docx-js
│   │   ├── email.ts              Resend email delivery
│   │   ├── supabase.ts           Supabase admin client
│   │   ├── usageLogger.ts        Fire-and-forget API cost logging
│   │   ├── weather.ts            Open-Meteo weather fetch
│   │   ├── pdf.ts                LibreOffice DOCX→PDF conversion
│   │   └── cleanup.ts            Scheduled cleanup (old pending photos etc.)
│   ├── prompts/
│   │   ├── classify.ts           System prompt for section classification
│   │   ├── analyseImage.ts       System prompt for photo analysis
│   │   ├── processObservation.ts System prompt for obs text processing
│   │   └── generateSummary.ts    System prompt for condition summary
│   ├── middleware/
│   │   ├── auth.ts               JWT verification via Supabase
│   │   └── rateLimits.ts         Per-endpoint rate limiters
│   ├── config/
│   │   └── models.ts             ← SINGLE SOURCE OF TRUTH for Claude model names
│   ├── index.ts                  Express app entry point
│   └── package.json
│
├── supabase/
│   ├── migrations/               Run these in order in the Supabase SQL Editor
│   │   ├── 20260430000001_initial_schema.sql
│   │   ├── 20260430000002_nullable_photo_observation.sql
│   │   ├── 20260501000001_add_job_title.sql
│   │   ├── 20260505000001_property_flag_rpc.sql
│   │   ├── 20260505000002_registration_and_bugs.sql  ← run before 00004
│   │   ├── 20260505000003_api_usage_log.sql
│   │   ├── 20260505000004_seed_properties.sql        ← requires 00002 first
│   │   └── 20260505000005_add_meter_reads_section.sql
│   └── SETUP.md                  Step-by-step Supabase setup guide
│
├── ASH_Inspection_App_User_Manual.html   PDF-ready user manual
├── ASH_Inspection_App_Build_Spec.docx    Original feature specification
├── ASH_Inspection_Report_Template.docx   Reference report template
├── CLAUDE.md                     AI assistant context and known issues
└── README.md                     ← you are here
```

---

## 5. Local Development Setup

### Step 1 — Clone and install

```bash
git clone https://github.com/randommonicle/ash-inspection-app
cd ash-inspection-app

cd server && npm install
cd ../app && npm install
```

### Step 2 — Set up environment variables

See [Section 6](#6-environment-variables-reference) for the full reference. The quick version:

**`server/.env`** (create this file, never commit it):
```env
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...       # service_role key from Supabase → Settings → API
RESEND_API_KEY=re_...
ADMIN_PASSWORD=your-admin-password
```

**`app/.env.local`** (create this file, never commit it):
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...     # anon key from Supabase → Settings → API
VITE_DEEPGRAM_API_KEY=...
VITE_API_BASE_URL=http://192.168.1.XXX:3001
```

> Find your local IP: run `ipconfig` on Windows, look for the IPv4 address of your active adapter.

### Step 3 — Set up the Supabase database

See `supabase/SETUP.md` for the full guide. Brief version:

1. Create a new Supabase project
2. Go to SQL Editor and run each migration in `supabase/migrations/` **in filename order**
3. Create a storage bucket named `inspection-files` (public read, authenticated write)
4. Create user accounts for Ben and Pete via Supabase Auth → Users

### Step 4 — Start the server

```bash
cd server
npm run dev
# → [STARTUP] ASH server running on http://localhost:3001
# Health check: http://localhost:3001/health
```

### Step 5 — Build and run on Android

```bash
cd app
npm run build                # compiles React → dist/
npx cap sync android         # copies dist/ into android/ project
# Then open Android Studio → select device → click Run (▶)
```

Repeat after any change to frontend source files or `.env.local`.

---

## 6. Environment Variables Reference

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key. Get from console.anthropic.com → API Keys |
| `SUPABASE_URL` | Yes | Your Supabase project URL. Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Service role key (bypasses RLS). Supabase → Settings → API → service_role |
| `RESEND_API_KEY` | Yes | Resend API key for email delivery. resend.com → API Keys |
| `ADMIN_PASSWORD` | Yes | Password for the `/admin` dashboard. Username is always `admin` |
| `PORT` | No | Port the server listens on. Defaults to 3001. Railway sets this automatically |
| `DEEPGRAM_API_KEY` | No | Only needed if you move transcription server-side (currently in the app) |

> **Warning:** `SUPABASE_SERVICE_KEY` is the service role key, not the anon key. It bypasses all Row Level Security policies. Never expose it to the frontend or commit it to git.

### App (`app/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Same Supabase URL as the server |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anon (public) key. Safe to embed in the app bundle |
| `VITE_DEEPGRAM_API_KEY` | Yes | Deepgram API key for real-time transcription in-app |
| `VITE_API_BASE_URL` | Yes | Base URL of the Express server. Use local IP for WiFi, tunnel URL for mobile data |

> **Security note:** `VITE_DEEPGRAM_API_KEY` is embedded in the app bundle and therefore visible to anyone who decompiles the APK. For a production release, move transcription to a server-side `/api/transcribe` route and remove this key from the app. This is listed in the pre-production checklist.

---

## 7. Database: Supabase

### Tables

| Table | Purpose |
|-------|---------|
| `properties` | All managed properties — name, ref, address, PM assignment, feature flags |
| `users` | Inspector profiles — full_name, email, job_title, role (inspector/admin) |
| `pm_roster` | Name-only whitelist of permitted PMs. Registration requires selecting a name from here |
| `inspections` | One row per inspection run. Status: active → completed → report_generated |
| `observations` | Voice observations — raw narration, processed text, action, risk level, section |
| `photos` | Photo metadata + Opus analysis JSON (`opus_description` JSONB column) |
| `bug_reports` | In-app bug reports submitted by PMs |
| `api_usage_log` | Per-call cost tracking for Anthropic and Deepgram (see Admin Dashboard) |

### Storage bucket

Bucket name: `inspection-files`

```
inspection-files/
└── {property_id}/
    └── {inspection_id}/
        ├── report.docx         Generated Word document
        └── {photo_id}.jpg      Uploaded photos
```

### section_key enum

The PostgreSQL enum `section_key` lists all 13 valid inspection sections. If you ever need to add a new section:

1. Add it to the enum: `ALTER TYPE section_key ADD VALUE IF NOT EXISTS 'new_section' AFTER 'existing_section';`
2. Add it to `app/src/types/index.ts` — `SectionKey`, `SECTION_LABELS`, `SECTION_ORDER`, `SECTION_TEMPLATE_ORDER`
3. Add it to `server/services/anthropic.ts` — `SectionKey` type
4. Add it to `server/prompts/classify.ts` — classification prompt
5. Add it to `server/routes/generateReport.ts` — `SECTION_LABELS_FOR_SYNTHESIS`, `SECTION_ORDER_FOR_SYNTHESIS`
6. Add it to `server/services/reportGenerator.ts` — `SECTION_LABELS`, `SECTION_ORDER`

### Row Level Security

RLS is enabled on all tables. Key policies:

- Inspectors can only read/write their own inspections and observations
- The `pm_roster` table is publicly readable (needed for registration dropdown) but only writable via the service role
- `bug_reports` are write-once by the authenticated inspector, readable only by admins
- The server uses the `service_role` key and bypasses RLS entirely

---

## 8. Building and Installing the Android APK

### Debug APK (for testing and sideloading)

```bash
# 1. Build the React app
cd app
npm run build

# 2. Sync to Android project
npx cap sync android

# 3. Open Android Studio and build
#    OR build from command line:
cd android

# Windows — set JAVA_HOME if not already set
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

./gradlew assembleDebug
```

APK output: `app/android/app/build/outputs/apk/debug/app-debug.apk`

To install directly to a connected device:
```bash
./gradlew installDebug
```

### Distributing to PMs

Share the APK file via email, WhatsApp, or Google Drive. The PM taps the file on their Android phone and follows the "Install from unknown sources" prompt. This is a one-time setting.

**After any code change**, repeat the build sequence (steps 1–3). The version on device does not auto-update — you need to share the new APK each time.

### Release APK (signed, for Google Play)

Not yet set up. See [Section 15 — iOS Rollout Plan](#15-ios-rollout-plan-and-costings) which also covers the Google Play release process.

---

## 9. Field Testing Over Mobile Data (Cloudflare Tunnel)

When testing on a device that is not on the same WiFi network as the development server, use Cloudflare Tunnel to expose the local server over HTTPS:

```bash
# Terminal 1 — start the server
cd server && npm run dev

# Terminal 2 — open a public HTTPS tunnel to the local server
cloudflared tunnel --url http://localhost:3001
# Output: https://some-random-name.trycloudflare.com
```

Update `app/.env.local`:
```env
VITE_API_BASE_URL=https://some-random-name.trycloudflare.com
```

Then rebuild and reinstall the app.

> **Note:** The tunnel URL changes every time `cloudflared` restarts. If the tunnel drops, re-run the command and update the URL. For permanent field testing, deploy the server to Railway (Section 10) instead.

---

## 10. Production Deployment (Railway)

The server is deployed as a Docker container on Railway.

### Current production URL

`https://ash-inspection-app-production.up.railway.app`

### How deployment works

Railway watches the `main` branch of the GitHub repo. Every push to `main` triggers an automatic rebuild and redeploy. The `Dockerfile` in `server/` handles the build.

The Dockerfile installs LibreOffice alongside Node.js so the server can convert DOCX reports to PDF using `libreoffice --headless`.

### Railway environment variables

Set these in Railway → Project → Variables:

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
RESEND_API_KEY
ADMIN_PASSWORD
PORT=3001
```

Railway sets `PORT` automatically but you can override it. The server reads `process.env.PORT` with a fallback of 3001.

### CORS

The server allows requests only from:
- `https://ash-inspection-app-production.up.railway.app` (Railway itself)
- `https://localhost` (Capacitor dev scheme)
- `capacitor://localhost` (Capacitor Android scheme)

If you change the Railway URL or app scheme, update `ALLOWED_ORIGINS` in `server/index.ts`.

---

## 11. Admin Dashboard

URL: `https://ash-inspection-app-production.up.railway.app/admin`

Credentials: username `admin`, password is the value of `ADMIN_PASSWORD` in Railway variables.

The dashboard is a self-contained HTML page served directly by the server with no external dependencies. It auto-refreshes every 30 seconds.

### Tabs

| Tab | What it shows |
|-----|--------------|
| **Live Inspections** | All inspections currently in `active` status, with PM name and property |
| **Recent Inspections** | Last 20 completed or report-generated inspections |
| **Inspectors** | All registered PM accounts with email and join date |
| **Properties** | All 70 properties with ref, address, and assigned PM |
| **Bug Reports** | All submitted bug reports and feature suggestions |
| **Costs & Usage** | Per-call API cost log. CSV export button for financial reporting |

### Cost tracking

Every paid API call (Anthropic and Deepgram) is logged to the `api_usage_log` table with:
- Service and model name
- Endpoint that triggered the call
- Input/output tokens (Anthropic) or audio seconds (Deepgram)
- Cost in USD

Current pricing baked into `server/services/usageLogger.ts`:

| Model/Service | Input | Output |
|--------------|-------|--------|
| claude-opus-4-6 | $15 / 1M tokens | $75 / 1M tokens |
| claude-sonnet-4-6 | $3 / 1M tokens | $15 / 1M tokens |
| Deepgram Nova-3 | $0.0059 / minute | — |

> If Anthropic or Deepgram change their pricing, update `ANTHROPIC_PRICING` and `DEEPGRAM_COST_PER_SECOND` in `server/services/usageLogger.ts`.

---

## 12. AI Model Routing and Costs

All model names are defined in **one place only**: `server/config/models.ts`. Never hardcode model names in route or service files.

```typescript
export const MODELS = {
  IMAGE_ANALYSIS: 'claude-opus-4-6',   // best vision accuracy
  CLASSIFICATION: 'claude-sonnet-4-6', // fast text classification
  OBSERVATION:    'claude-sonnet-4-6', // observation text processing
  SUMMARY:        'claude-sonnet-4-6', // condition summary generation
  COMPARISON:     'claude-sonnet-4-6', // recurring items comparison
}
```

### Why Opus for photos?

Opus is the most capable vision model and identifies subtle defects (hairline cracks, staining, drainage blockages) that Sonnet misses. Photos are typically the most legally significant part of the report, so accuracy outweighs cost here.

### Approximate cost per inspection

Based on a typical inspection with ~15 observations and ~20 photos:

| Step | Model | Approx. cost |
|------|-------|-------------|
| 15 × classification calls | Sonnet | ~$0.002 |
| 20 × photo analysis | Opus | ~$0.04 |
| 15 × observation processing | Sonnet | ~$0.015 |
| 1 × recurring items comparison | Sonnet | ~$0.003 |
| 1 × summary generation | Sonnet | ~$0.002 |
| ~8 minutes of audio | Deepgram | ~$0.047 |
| **Total** | | **~£0.08 per inspection** |

---

## 13. Report Generation Pipeline

`POST /api/generate-report` runs a 9-step pipeline:

```
Step 1  Fetch inspection, inspector, and property from Supabase
Step 2  Fetch observations; process any unprocessed raw narrations through Sonnet
Step 3  Fetch photos; download image data; run late Opus analysis on any unanalysed photos
Step 4  Synthesise observations for sections that have photos but no narration
Step 5  Compare current observations against previous inspection to identify recurring items
Step 6  Generate overall condition summary (Sonnet) + fetch weather (Open-Meteo)
Step 7  Build Word document (docx-js)
Step 8  Upload DOCX to Supabase Storage; update inspection status to report_generated
Step 9  Convert DOCX to PDF (LibreOffice headless); email both files to the inspector (Resend)
```

### Ownership check

Only the inspector who ran the inspection can generate its report. The route checks `inspection.inspector_id === req.userId` and returns 403 otherwise. This prevents cross-user data access and prevents one PM from running up costs on another's inspection.

### Fallback behaviour

The pipeline is designed so that individual step failures do not abort the whole report:

- If observation processing fails for one obs, the raw narration is used as fallback text
- If photo synthesis fails for a section, that section is omitted gracefully
- If the recurring items check fails, the report is still generated without that section
- If summary generation fails, a canned fallback text is used
- If the PDF conversion fails, the email still sends with the DOCX only

---

## 14. Inspection Sections Reference

The 13 standard inspection sections, in report order:

| # | Section Key | Report Label | Gated by property flag? |
|---|-------------|-------------|------------------------|
| 1 | `external_approach` | External Approach and Entrance | No |
| 2 | `grounds` | Grounds and Landscaping | No |
| 3 | `bin_store` | Bin Store and Waste Facilities | No |
| 4 | `car_park` | Car Park | `has_car_park` |
| 5 | `external_fabric` | External Fabric and Elevations | No |
| 6 | `roof` | Roof and Roof Terrace | `has_roof_access` |
| 7 | `communal_entrance` | Communal Entrance and Reception | No |
| 8 | `stairwells` | Stairwells and Circulation | No |
| 9 | `lifts` | Lifts | `has_lift` |
| 10 | `plant_room` | Plant Room and Utilities | No |
| 11 | `meter_reads` | Meter Reads and Utility Services | No |
| 12 | `internal_communal` | Internal Communal Areas (General) | No |
| 13 | `additional` | Additional / Property-Specific Areas | No |

Sections with a property flag are omitted from the report entirely if the flag is `false` for that property. This is set in the `properties` table and affects `has_car_park`, `has_lift`, and `has_roof_access`.

**Meter Reads note:** PMs should always attempt a meter reading, photograph the meter display, and note the reading and serial number. If the meter cupboard is inaccessible, mark N/A with a note. Meter photos should be forwarded to the energy broker.

---

## 15. iOS Rollout Plan and Costings

The app is currently Android-only. iOS requires Apple's toolchain (Xcode), which only runs on macOS. The code itself is Capacitor-based and is already iOS-compatible — the barrier is purely the build environment.

### What needs to happen

1. **Generate the iOS Xcode project** (run once on any machine with Node):
   ```bash
   cd app
   npx cap add ios
   npx cap sync ios
   ```
   This creates the `app/ios/` directory and commits it to the repo.

2. **Set the Bundle ID** in Xcode (`App/App/Info.plist`):
   Set to `co.uk.ashproperty.inspection` (matching the Android app ID).

3. **Configure signing** — requires an Apple Developer account (see options below).

4. **Test on a real iPhone** — the iOS Simulator cannot test camera, microphone, or local notifications.

5. **Build the IPA** (the iOS equivalent of an APK) — requires macOS with Xcode.

6. **Distribute** — either via Sideloadly (sideloading) or TestFlight/App Store.

---

### Option A — GitHub Actions macOS Build (recommended first step)

GitHub's hosted runners include macOS machines with Xcode pre-installed. We can configure a GitHub Actions workflow to build the IPA automatically on every push, without owning a Mac.

**Cost:** Free for public repos. For private repos, GitHub gives 2,000 free macOS minutes per month; additional minutes cost $0.08/minute. A single build takes ~10–15 minutes = ~$0.80–$1.20 per build.

**Setup steps:**

1. Generate the iOS project locally (step 1 above) and push `app/ios/` to the repo
2. Create an Apple Developer account (see below)
3. Add signing certificates to GitHub Secrets
4. Create `.github/workflows/ios-build.yml`:

```yaml
name: iOS Build
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd app && npm install && npm run build
      - run: cd app && npx cap sync ios
      - name: Build IPA
        run: |
          cd app/ios/App
          xcodebuild -scheme App -configuration Release \
            -archivePath build/App.xcarchive archive
          xcodebuild -exportArchive \
            -archivePath build/App.xcarchive \
            -exportPath build/output \
            -exportOptionsPlist ExportOptions.plist
      - uses: actions/upload-artifact@v4
        with:
          name: ash-inspection-ios
          path: app/ios/App/build/output/*.ipa
```

The IPA is then downloadable from the GitHub Actions run page.

---

### Option B — Mac Mini (recommended if ASH adopt the app)

Buying a Mac Mini gives full control over builds, signing, App Store submission, and ongoing maintenance.

**Cost:**
- Mac Mini (M2, entry level): ~£599–£699 (one-off)
- Apple Developer Program: £99/year
- **Total year 1:** ~£700–£800

**Advantages over GitHub Actions:**
- Faster builds (no queue waiting)
- Can submit to App Store directly
- Full Xcode debugger access for iOS-specific issues
- No per-minute billing

---

### Option C — Cloud Mac Service

Rent a macOS virtual machine when you need it.

| Service | Cost | Notes |
|---------|------|-------|
| MacStadium | ~$49/month (on-demand Mac Mini) | Cancel when not needed |
| GitHub Actions (macOS) | $0.08/minute | Pay per build only |
| Codemagic | Free tier (500 min/month), then $0.095/min | CI/CD focused, easy setup |

---

### Apple Developer Account options

| Account type | Cost | Certificate validity | Distribution method |
|-------------|------|---------------------|---------------------|
| **Free Apple ID** | £0 | 7 days — must re-sign weekly | Sideloading only |
| **Individual Developer** | £99/year | 1 year | Sideloading + TestFlight + App Store |
| **Enterprise** | £299/year | 1 year | Internal distribution (no App Store) |

For a small team of ~5 PMs, the **Individual Developer** account at £99/year is the right choice.

---

### Sideloading vs App Store

**Sideloading** means installing the IPA directly to a device without going through the App Store. Use this tool on Windows:

- **Sideloadly** (free, sideloadly.io) — connects to iPhone via USB, signs with Apple ID, installs IPA
- Requires the iPhone to be registered as a test device against the Developer account
- With a paid Developer account: cert lasts 1 year, no repeated installs needed

**App Store / TestFlight:**
- TestFlight: beta distribution to named testers. Easier than sideloading; PMs install from TestFlight app
- App Store: public listing, managed installs and updates. Requires App Review (~1–3 days)

For a closed tool used only by ASH's own PMs, **TestFlight** is the ideal distribution method once a Developer account exists.

---

### Recommended iOS Rollout Timeline

```
Month 1  Get Apple Developer account (£99)
         Run npx cap add ios, push ios/ to repo
         Set up GitHub Actions build workflow (free tier)
         Download IPA, sideload to one test iPhone via Sideloadly
         Test full workflow — recording, sync, report generation

Month 2  Fix any iOS-specific UI issues (typically minor)
         Add all PM iPhones as registered test devices
         Set up TestFlight for easy distribution

Month 3+ If ASH formally adopt the app → consider Mac Mini purchase
         Submit to App Store for managed distribution and auto-updates
```

---

### Total iOS cost summary

| Scenario | Year 1 | Year 2+ |
|---------|--------|---------|
| GitHub Actions + sideloading | £99 (dev account) + ~£5 build costs | £99/year |
| GitHub Actions + TestFlight | £99 + ~£5 | £99/year |
| Mac Mini + App Store | £700–800 | £99/year |

---

## 16. Pre-Production Checklist

Before this app is used in production with real inspections:

- [ ] **Move Deepgram key to server-side** — `VITE_DEEPGRAM_API_KEY` is currently in the app bundle. Move transcription to `POST /api/transcribe` and remove the key from the frontend. A stub route exists at `server/routes/transcribe.ts`.
- [ ] **Replace CORS wildcard** — `server/index.ts` currently allows specific known origins. Confirm the final Railway URL is in `ALLOWED_ORIGINS`.
- [ ] **Verify Resend domain** — `ashproperty.co.uk` must be verified in Resend (DNS records added) and the `from` address in `server/services/email.ts` updated to a real `@ashproperty.co.uk` address.
- [ ] **Wipe test data** — Before go-live, truncate `inspections`, `observations`, `photos`, `api_usage_log`, and clear the `inspection-files` storage bucket. Leave `users` and `properties` intact.
- [ ] **Set ADMIN_PASSWORD** in Railway variables (if not done).
- [ ] **Enable Supabase Auth email confirmation** — currently off to allow instant registration during development. Turn on for production so new accounts require email verification.
- [ ] **Google Play Store listing** — Create a developer account ($25 one-off), upload a signed release APK, fill in store listing, submit for review.

---

## 17. Key Files Reference

| File | Why you'd open it |
|------|--------------------|
| `server/config/models.ts` | Change which Claude model is used for any task |
| `server/prompts/classify.ts` | Change how observations are classified into sections |
| `server/prompts/processObservation.ts` | Change the tone/format of processed observation text |
| `server/prompts/generateSummary.ts` | Change the overall condition summary style |
| `server/routes/generateReport.ts` | The 9-step report pipeline — logic and orchestration |
| `server/services/reportGenerator.ts` | Word document layout — fonts, colours, tables, photos |
| `server/services/usageLogger.ts` | Update API pricing when Anthropic/Deepgram change rates |
| `server/services/email.ts` | Change report email template or `from` address |
| `server/routes/admin.ts` | Admin dashboard HTML and its data endpoints |
| `app/src/types/index.ts` | Add/remove inspection sections; section labels and order |
| `app/src/screens/ActiveInspectionScreen.tsx` | Main inspection UI — recording, observations, camera |
| `app/src/screens/PropertyDetailScreen.tsx` | Property page — history, report generation trigger |
| `app/src/db/database.ts` | SQLite schema and all local CRUD operations |
| `app/src/services/sync.ts` | Background sync logic — obs and photos upload queue |
| `app/src/contexts/AuthContext.tsx` | Auth state — session management and re-login behaviour |
| `supabase/migrations/` | Database schema history — run these in order |

---

## 18. Troubleshooting

**Server won't start / `ANTHROPIC_API_KEY is not set`**
→ Check `server/.env` exists and contains the key. The file is gitignored and must be created manually.

**App can't reach server / network errors on device**
→ Check `VITE_API_BASE_URL` in `app/.env.local` matches the machine's current local IP. Run `ipconfig` to find it. Rebuild and reinstall after changing.

**Classification returns wrong section**
→ Check `server/prompts/classify.ts`. The classification prompt lists keywords for each section — add the missing term to the correct section's description.

**Report generation fails with "Inspection not found"**
→ Check the inspection exists in Supabase and that the `inspector_id` matches the logged-in user's UUID.

**Photos not appearing in report**
→ The photo must have synced to Supabase and been analysed by Opus before report generation. Check the `photos` table — the `storage_path` column should be populated and `opus_description` should be non-null.

**`gradlew assembleDebug` fails with JAVA_HOME error**
→ Run `set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` then retry.

**tsx watch not picking up server changes**
→ Restart the server manually: Ctrl+C → `npm run dev`.

**Recurring items not appearing in report**
→ The previous inspection must have `status = 'completed'` or `status = 'report_generated'` and a `start_time` earlier than the current inspection. Check both conditions in Supabase.

**Email not sending**
→ Check `RESEND_API_KEY` is set in Railway. Check that the sending domain (`ashproperty.co.uk`) is verified in Resend. Check Railway logs for `[REPORT]` lines.

**`pm_roster` does not exist error when running migration 00004**
→ Migration 00004 depends on 00002. Run 00002 first, then 00004.
