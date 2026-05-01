# ASH Inspection App — Claude Code Guide

---

## ⚡ START HERE — READ THIS FIRST EVERY SESSION

**Step 1:** Ask the user — "Are you on your home computer or work computer?"

**Step 2:** Ask — "Are you preparing for a live field test today, or doing development work?"

Then follow the relevant checklist below before touching any code.

---

## 🏢 Work computer — live field test day (Cloudflare tunnel required)

This is the setup needed when the app will be used over mobile data (not on the office WiFi).

**Do this before leaving the office:**

1. Open a terminal in `[work path]\ash-inspection-app\server`
2. Run `npm run dev` — keep this terminal open all day
3. Open a second terminal and run: `cloudflared tunnel --url http://localhost:3001`
4. Copy the generated `https://xxxx-xxxx-xxxx.trycloudflare.com` URL
5. Open `app/.env.local` and update: `VITE_API_BASE_URL=https://xxxx-xxxx-xxxx.trycloudflare.com`
6. In the app terminal: `npm run build` then `npx cap sync android`
7. Install on all test devices via Android Studio (Run button)
8. Verify the server is reachable: open `https://xxxx-xxxx-xxxx.trycloudflare.com/health` in a browser — should return `{"ok":true}`

**Critical reminders:**
- The tunnel URL changes every time `cloudflared` restarts — if you restart it, repeat steps 4–7
- Your work PC must stay awake and the two terminals must stay open while out in the field
- If classification shows errors in the app, the tunnel has likely dropped — check the server terminal

**Email routing during testing:**
- All reports currently route to `ben.graham240689@gmail.com` via `REPORT_TO_OVERRIDE` in `server/.env`
- Pete's reports will also come to Ben's Gmail — this is intentional for now

---

## 🏢 Work computer — development only (same WiFi as phone)

1. Start server: `npm run dev` in `server/`
2. Start frontend: `npm run dev` in `app/`
3. Check `app/.env.local` → `VITE_API_BASE_URL` points to the work PC's local IP
4. USB or WiFi debug via Android Studio

---

## 🏠 Home computer setup

**Backend server**
- Working directory: `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\server`
- Start: `npm run dev` (leave this terminal open)
- Runs on: `http://localhost:3001`
- Env file: `server/.env` — contains all API keys (never committed)

**Frontend dev server**
- Working directory: `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\app`
- Start: `npm run dev` (leave this terminal open)
- Runs on: `http://localhost:5173`

**API base URL**
- `app/.env.local` → `VITE_API_BASE_URL=http://192.168.1.108:3001`
- 192.168.1.108 is the home PC's local IP — verify with `ipconfig` if the phone can't reach the server
- If the IP has changed: update `app/.env.local`, then rebuild and reinstall the app

**Android device testing**
- Phone and PC must be on the same WiFi
- Kaspersky VPN and Firewall must be disabled for WiFi debugging
- Open Android Studio → device appears in Running Devices panel
- After any code change: `npm run build` → `npx cap sync android` → Run in Android Studio
- The app must be rebuilt and reinstalled for any frontend or `.env.local` changes to take effect

---

## Key things to remember

- **Both terminal windows must stay open** — closing either stops the server or frontend
- **Rebuild required** after any `.env.local` or frontend source file change before testing on device
- **Server hot-reloads** on TypeScript file changes (tsx watch) — but **does not reload on .env changes** — restart manually if you edit .env
- **API keys** live in `server/.env` and `app/.env.local` — neither is committed to git
- **Model routing is a hard rule**: image analysis = `claude-opus-4-6`, everything else = `claude-sonnet-4-6`. Only defined in `server/config/models.ts` — never hardcode model names elsewhere
- **iOS not supported yet** — testing is Android only. iOS requires macOS + Xcode + Apple Developer account

---

## Build phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Supabase, auth, property list |
| 2 | ✅ Done | Recording, transcription, SQLite, camera |
| 3 | ✅ Done | AI classification, section picker, low-confidence banner |
| 4 | ✅ Done | Full sync queue, photo upload, Opus image analysis, sync status indicator |
| 5 | ✅ Done | Observation processing, AI summary, Word report generation, Resend email |
| 6 | ⬜ Next | Section review screen, inspection summary screen, report preview, property flags editor |

---

## What works offline vs what needs the server

| Feature | Offline (no network) | Online (Supabase only) | Needs local server |
|---|---|---|---|
| Login | ❌ | ✅ | — |
| Property list | ❌ | ✅ | — |
| Audio recording | ✅ | ✅ | — |
| Transcription (Deepgram) | ❌ | ✅ | — |
| AI classification | ❌ | ❌ | ✅ `/api/classify` |
| Save observations locally | ✅ | ✅ | — |
| Camera | ✅ | ✅ | — |
| Sync observations to Supabase | ❌ | ✅ | — |
| Photo upload to Supabase | ❌ | ✅ | — |
| Opus photo analysis | ❌ | ❌ | ✅ `/api/analyse-photo` |
| Generate report | ❌ | ❌ | ✅ `/api/generate-report` |

**If classification fails** (server unreachable): observation is saved to "Additional" section and an error is shown. The inspection continues — observations are not lost.

---

## Phase 4 — sync and photo analysis

**Sync flow** (`app/src/services/sync.ts`):
1. On inspection complete → `triggerSync()` is called
2. Fetches all local inspections with `status = 'completed'` and not yet synced
3. For each: upsert inspection → upsert observations → upload photos to Supabase Storage
4. After each photo upload → calls `POST /api/analyse-photo` on the backend
5. Server downloads photo, runs claude-opus-4-6, saves description JSON to `photos.opus_description`
6. Inspection marked synced in local SQLite

**Sync status dot in ActiveInspection top bar:**
- 🟢 Green = online, idle
- 🔵 Blue pulsing = syncing
- 🟡 Amber = offline
- 🔴 Red = sync error

**Supabase Storage RLS** — `inspection-files` bucket needs two policies:
- `INSERT` for authenticated users — allows app to upload
- `SELECT` for authenticated users — allows server to download for Opus analysis
- If uploads fail with "violates row-level security policy" → check Supabase → Storage → inspection-files → Policies

---

## Phase 5 — report generation

**Trigger:** "Generate Report" button on the PropertyDetailScreen, visible only on completed + synced inspections. Shows "Regenerate Report" after first send.

**Flow** (`server/routes/generateReport.ts`):
1. Fetch inspection, property (with flags), inspector details from Supabase
2. Fetch and process all observations — Sonnet converts raw narrations to professional text + action + risk level. Saves back to Supabase.
3. Generate AI overall condition summary (Sonnet)
4. Download all photos from Supabase Storage
5. Build Word document matching ASH template (`server/services/reportGenerator.ts`)
6. Upload `report.docx` to Supabase Storage at `/{property_id}/{inspection_id}/report.docx`
7. Update inspection status to `report_generated`
8. Send email via Resend with .docx attached

**Email routing:**
- `REPORT_TO_OVERRIDE` in `server/.env` redirects all emails to a fixed address (currently `ben.graham240689@gmail.com`)
- Remove this env var when per-inspector routing is ready for production
- Resend `from` address uses `onboarding@resend.dev` (Resend test sender — no domain verification needed)
- When ready for production: verify `ashproperty.co.uk` domain in Resend dashboard and update the `from` field in `server/services/email.ts`

**Property flags** — sections are omitted from the report if the property flag is false:
- `has_car_park = false` → Car Park section omitted
- `has_lift = false` → Lifts section omitted
- `has_roof_access = false` → Roof section omitted

---

## Known issues / pre-production checklist

Every item below has a matching `// TODO [PRODUCTION]:` comment in the source file.
Run `grep -r "TODO \[PRODUCTION\]"` from the repo root to list them all at once.

- [ ] **Deepgram key in frontend bundle** — `app/src/services/transcription.ts`
      Move to a `POST /api/transcribe` backend route; add `DEEPGRAM_API_KEY` to `server/.env`;
      remove `VITE_DEEPGRAM_API_KEY` from `app/.env.local`

- [ ] **Mixed-content / cleartext traffic** — `app/capacitor.config.ts` + `app/android/app/src/main/AndroidManifest.xml`
      Remove `allowMixedContent: true` once the server is deployed behind HTTPS.
      Verify no `android:usesCleartextTraffic="true"` in the merged release manifest.

- [ ] **CORS wildcard** — `server/index.ts`
      Replace `cors()` with `cors({ origin: ['https://app.ashproperty.co.uk'] })`

- [ ] **Resend sender address** — `server/services/email.ts`
      Verify `ashproperty.co.uk` in the Resend dashboard; change `from` to
      `'ASH Inspection Reports <reports@ashproperty.co.uk>'` (or agreed address)

- [ ] **Remove REPORT_TO_OVERRIDE** — `server/.env` + `server/services/email.ts`
      Delete the env var so reports route to each inspector's own email

- [ ] **Report header email address** — `server/services/reportGenerator.ts`
      Replace `ben@ashproperty.co.uk` with the firm's general enquiries address

- [ ] **Recurring items comparison** — `server/services/reportGenerator.ts`
      Implement real previous-inspection comparison instead of the placeholder row

- [ ] **`allowNavigation` IP whitelist** — `app/capacitor.config.ts`
      Replace `192.168.1.108` with the production server domain

- [ ] **PDF generation** — report is sent as `.docx` only; add LibreOffice/headless
      conversion on the server if a PDF copy is required

- [ ] **Server deployment** — currently runs locally; deploy to Railway or Render for
      permanent HTTPS hosting so field tests don't need the work PC left on

---

## Project structure

```
ash-inspection-app/
├── app/                        # React + Capacitor frontend
│   ├── src/
│   │   ├── components/         # RecordButton, ObservationFeedItem, SectionPicker
│   │   ├── screens/            # ActiveInspectionScreen, PropertyListScreen, PropertyDetailScreen
│   │   ├── services/           # sync.ts, classify.ts, transcription.ts, report.ts, supabase.ts
│   │   ├── db/                 # SQLite local database (database.ts)
│   │   ├── hooks/              # useSync.ts, useNetwork.ts
│   │   ├── contexts/           # AuthContext
│   │   └── config/models.ts    # Model routing — only place model names appear
│   └── android/                # Capacitor Android project
├── server/                     # Node.js Express backend
│   ├── routes/                 # classify.ts, analysePhoto.ts, generateReport.ts
│   ├── services/               # anthropic.ts, supabase.ts, reportGenerator.ts, email.ts
│   ├── prompts/                # classify.ts, analyseImage.ts, processObservation.ts, generateSummary.ts
│   └── config/models.ts        # Model names — single source of truth
└── supabase/
    └── migrations/             # Run in order — check numbering before adding new ones
```
