# ASH Inspection App

A mobile-first property inspection tool for ASH Property Management. Inspectors walk a property, record voice observations on their Android phone, and receive a branded Word report by email within minutes of completing the inspection.

---

## Architecture at a glance

```
ash-inspection-app/
├── app/        React 18 + Vite + Capacitor 6 (Android)
└── server/     Node.js + Express backend (runs locally or on Railway/Render)
```

**Data flow:**

1. Inspector records a voice observation → Deepgram transcribes it in real time
2. App calls the local server to classify the observation into the correct report section (Claude Sonnet)
3. Completed inspection is synced to Supabase; photos are uploaded and analysed by Claude Opus
4. "Generate Report" triggers the server to process all observations, build a Word document, and email it

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | |
| npm | ≥ 10 | |
| Android Studio | Ladybug+ | For device installation |
| Java JDK | 17 | Required by Gradle |

Accounts required:
- **Supabase** — database, auth, and file storage
- **Anthropic** — AI classification, photo analysis, and report text
- **Deepgram** — real-time speech transcription
- **Resend** — transactional email delivery

---

## Local development setup

### 1. Clone and install

```bash
git clone <repo-url>
cd ash-inspection-app

# Backend
cd server && npm install

# Frontend
cd ../app && npm install
```

### 2. Environment variables

**`server/.env`** (create this file — never committed):

```env
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=re_...
REPORT_TO_OVERRIDE=your@email.com   # routes ALL report emails here during testing; remove for production
```

**`app/.env.local`** (create this file — never committed):

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_DEEPGRAM_API_KEY=...
VITE_API_BASE_URL=http://192.168.1.XXX:3001   # local IP of the machine running the server
```

> **Finding your local IP:** run `ipconfig` (Windows) and look for the IPv4 address of your active network adapter.

### 3. Start the backend

```bash
cd server
npm run dev
# Server starts at http://localhost:3001
# Health check: http://localhost:3001/health → {"ok":true}
```

> **Note:** tsx watch sometimes fails to detect saves from external editors. If you make server-side changes and the `[REPORT]` / `[RECURRING]` logs don't appear, restart the server manually (Ctrl+C → `npm run dev`).

### 4. Start the frontend dev server (browser preview only)

```bash
cd app
npm run dev
# Opens at http://localhost:5173
```

> SQLite and the camera are **not available in the browser**. Use a physical Android device for full testing.

### 5. Build and install on Android

```bash
cd app
npm run build
npx cap sync android
# Then open Android Studio → click Run (▶)
```

Repeat after **any** change to frontend source files or `.env.local`.

---

## Field test setup (Cloudflare tunnel)

When the app is used over mobile data (not on the same WiFi as the server):

```bash
# Terminal 1 — start the server
cd server && npm run dev

# Terminal 2 — open a public HTTPS tunnel
cloudflared tunnel --url http://localhost:3001
# Copy the generated https://xxxx.trycloudflare.com URL
```

Update `app/.env.local`:

```env
VITE_API_BASE_URL=https://xxxx.trycloudflare.com
```

Then rebuild and reinstall the app. The tunnel URL changes every time `cloudflared` restarts — if it drops, repeat from step 2.

---

## Key source files

| File | Purpose |
|------|---------|
| `app/src/screens/ActiveInspectionScreen.tsx` | Main inspection UI — recording, observations, camera, sync |
| `app/src/screens/PropertyDetailScreen.tsx` | Property detail, inspection history, report generation trigger |
| `app/src/components/RecordButton.tsx` | Tap-to-record button with cancel and "append" modes |
| `app/src/components/ObservationFeedItem.tsx` | Single observation card — section picker, append-more button |
| `app/src/db/database.ts` | SQLite schema and all local CRUD operations |
| `app/src/services/sync.ts` | Background sync queue — uploads inspections and photos to Supabase |
| `app/src/contexts/AuthContext.tsx` | Auth state — clears session on cold start so re-login is always required |
| `server/routes/generateReport.ts` | 9-step report generation pipeline |
| `server/services/reportGenerator.ts` | Word document builder using docx-js |
| `server/config/models.ts` | **Single source of truth** for Claude model names — never hardcode elsewhere |

---

## AI model routing

| Use case | Model | Why |
|----------|-------|-----|
| Observation classification | `claude-sonnet-4-6` | Fast and cost-effective for text |
| Observation text processing | `claude-sonnet-4-6` | Same |
| Condition summary generation | `claude-sonnet-4-6` | Same |
| Recurring items comparison | `claude-sonnet-4-6` | Same |
| Photo analysis | `claude-opus-4-6` | Best vision accuracy for defect identification |

Model names are defined only in `server/config/models.ts`. Never hardcode them in route or service files.

---

## Supabase schema overview

| Table | Purpose |
|-------|---------|
| `properties` | Property records (name, ref, address, features) |
| `users` | Inspector profiles (full_name, email, job_title) |
| `inspections` | One row per inspection run |
| `observations` | Voice observations — raw + processed text, section, risk level |
| `photos` | Photo metadata + Opus vision description JSON |

**Storage bucket:** `inspection-files`
- `/{property_id}/{inspection_id}/report.docx` — generated report
- `/{property_id}/{inspection_id}/{photo_id}.jpg` — uploaded photos

---

## Pre-production checklist

See `CLAUDE.md` → "Known issues / pre-production checklist" for the full annotated list.

Key items remaining before production:
- Move Deepgram key from frontend bundle to a `/api/transcribe` backend route
- Replace CORS wildcard with the production app domain
- Verify `ashproperty.co.uk` in Resend and update the `from` address
- Remove `REPORT_TO_OVERRIDE` so reports route to each inspector's email
- Deploy the server to Railway or Render (currently must run on a local machine)
- Add inspector signature support to the report (future phase)
