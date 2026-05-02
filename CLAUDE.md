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
- **tsx watch + external editors**: tsx watch sometimes fails to detect saves made by Claude Code or other external tools. If you add server-side code and the `[REPORT]` / `[RECURRING]` console logs don't appear, **manually restart the server** (Ctrl+C → `npm run dev`)
- **API keys** live in `server/.env` and `app/.env.local` — neither is committed to git
- **Model routing is a hard rule**: image analysis = `claude-opus-4-6`, everything else = `claude-sonnet-4-6`. Only defined in `server/config/models.ts` — never hardcode model names elsewhere
- **iOS not supported yet** — testing is Android only. iOS requires macOS + Xcode + Apple Developer account
- **LibreOffice required for PDF generation** — installed on the work PC. NOT yet installed on Ben's home PC — if testing at home over a weekend, install from https://www.libreoffice.org/download/libreoffice-still/ before running the server. Without it the server will still generate and email the DOCX but will skip the PDF.

---

## Build phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Supabase, auth, property list |
| 2 | ✅ Done | Recording, transcription, SQLite, camera |
| 3 | ✅ Done | AI classification, section picker, low-confidence banner |
| 4 | ✅ Done | Full sync queue, photo upload, Opus image analysis, sync status indicator |
| 5 | ✅ Done | Observation processing, AI summary, Word report generation, Resend email |
| 5.5 | ✅ Done | First 4G field test, recurring items, PDF generation, dual email, property autocorrect, photo appendix groundwork |
| 6 | ⬜ Next | Photo appendix with section links, tap-to-fullscreen in app, duplicate image grouping, server deployment |

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

**Trigger:** "Generate Report" button on the PropertyDetailScreen, visible only on completed + synced inspections. Shows "Regenerate Report" after the first report has been sent (persisted in SQLite `report_sent` column, backfilled from Supabase on screen load).

**Flow** (`server/routes/generateReport.ts`):
1. Fetch inspection, property (with flags), inspector details from Supabase
2. Fetch and process all observations — Sonnet converts raw narrations to professional text + action + risk level. Property name/ref/address passed as context so phonetic misspellings from voice narration are auto-corrected. Saves back to Supabase.
3. **Recurring items** — finds the most recent previous inspection for the same property (status `completed` OR `report_generated`), fetches its observations that had `action_text`, then asks Sonnet which are still outstanding in the current observations. Results appear in the "Matters Arising from Previous Inspection" table in the report. Entire step is non-fatal — returns empty list on any error.
4. Generate AI overall condition summary (Sonnet)
5. Download all photos from Supabase Storage. If any photo has no `opus_description` (e.g. server was down during sync), Opus analysis runs inline here and saves back to Supabase.
6. Build Word document matching ASH template (`server/services/reportGenerator.ts`)
7. Upload `report.docx` to Supabase Storage at `/{property_id}/{inspection_id}/report.docx`
8. Update inspection status to `report_generated`
9. Convert DOCX to PDF via LibreOffice (`server/services/pdf.ts`) — skipped gracefully if LibreOffice not installed
10. Send email via Resend with both DOCX and PDF attached (DOCX for internal editing, PDF as client-ready copy)

**Report sent persistence:**
- After a successful report send, `report_sent=1` is written to local SQLite
- On PropertyDetailScreen load, any synced inspection without a local `report_sent` flag is backfilled by checking Supabase for `status = 'report_generated'`
- This ensures the "Regenerate Report" label survives logout/app restart

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

## Recording UX — tap-to-record

Recording uses a **tap-to-start / tap-to-stop** model, not hold-to-record. This was chosen because inspectors often work in confined spaces and can't hold a button while talking.

**RecordButton layout** (`app/src/components/RecordButton.tsx`):
- Three zones: `[cancel/empty] [record] [rightSlot]` — always balanced
- Cancel × appears to the LEFT while recording (tap to discard the take)
- Camera button is passed in as `rightSlot` from the parent so it stays visible at all times
- `appendMode` prop changes idle label to "Tap to continue" when adding to an existing observation
- Max recording duration: **60 seconds**

**Adding more to an observation** (`app/src/screens/ActiveInspectionScreen.tsx`):
- Each observation in the feed has an "Add more to this observation" button
- Tapping it sets `appendingToId` state and shows a blue border on that observation card
- The next recording is appended (with a space separator) to that observation's `raw_narration`
- The observation is re-synced with `synced=0` so the updated narration goes to Supabase

**Authentication on cold start** (`app/src/contexts/AuthContext.tsx`):
- `supabase.auth.signOut({ scope: 'local' })` is called every time the JS runtime initialises
- This clears any persisted auth token so the inspector must re-login on every cold start
- Background/foreground does not trigger a sign-out (the JS runtime stays alive)

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
      Domain `propertyappdev.co.uk` registered and Cloudflare DNS records added (2 May 2026).
      Awaiting Resend verification. Once verified, change `from` to
      `'ASH Property App <reports@propertyappdev.co.uk>'`

- [ ] **Remove REPORT_TO_OVERRIDE** — Railway Variables + `server/services/email.ts`
      Remove from Railway Variables once Resend verifies propertyappdev.co.uk.
      Inspector emails in Supabase users table already updated to Proton addresses (2 May 2026):
      Pete Birch → petebirchpm@proton.me, Ben Graham → ben240689@proton.me

- [ ] **Report header email address** — `server/services/reportGenerator.ts`
      Replace `ben@ashproperty.co.uk` with the firm's general enquiries address

- [ ] **`allowNavigation` IP whitelist** — `app/capacitor.config.ts`
      Replace `192.168.1.108` with `ash-inspection-app-production.up.railway.app`

- [x] **Server deployment** — deployed to Railway 2 May 2026
      URL: `https://ash-inspection-app-production.up.railway.app`
      LibreOffice included in Dockerfile. All env vars set in Railway Variables dashboard.

---

## Phase 6 — planned features

These were agreed after the first field test with Pete Birch on 1 May 2026.

**Photo appendix with section links** (`server/services/reportGenerator.ts`)
- Add bookmarks to each section heading in the Word document
- Build an appendix at the end with small photo thumbnails
- Each thumbnail is a clickable internal hyperlink back to its section
- Medium effort, high value for longer inspections with many photos

**Tap-to-fullscreen photo viewer** (`app/src/screens/ActiveInspectionScreen.tsx` or new component)
- Tapping a photo thumbnail during an inspection opens it full-screen with the Opus caption
- Low effort, improves usability during review

**Duplicate image grouping** (`server/routes/generateReport.ts`)
- If Opus identifies multiple photos of the same subject (via description similarity), keep one in the section and move the rest to the appendix
- Prevents the same wall/defect appearing three times in the same section
- Medium effort

**PDF workflow — future phase**
- Currently: DOCX and PDF both emailed to the inspector
- Future: inspector edits DOCX in Word if needed, re-uploads to trigger PDF re-generation and re-send
- Implementation: "Upload revised report" button in PropertyDetailScreen → uploads to Supabase Storage → server converts and re-emails

**Opus → Sonnet supplementary observations** (future)
- If Opus identifies something notable in a photo that has no matching observation in that section, Sonnet drafts a supplementary observation
- Requires careful deduplication against existing narrations

**Photo-only inspection mode** (future)
- Inspector takes photos only, no voice narrations
- Opus classifies each photo into the correct section
- Sonnet drafts observations from Opus descriptions alone

**Inspector signature on report** (future)
- Option A: stored signature image applied automatically
- Option B: inspector prompted to sign on their phone at report generation, appended to document

**Confidence banner improvement** (done 1 May 2026)
- Banner now says "Not sure about the last observation ↓"
- Relevant observation card highlighted with amber border matching the banner colour

---

## Server management

**Production server (Railway) — use this for all testing from 2 May 2026:**
- URL: `https://ash-inspection-app-production.up.railway.app`
- Health check: `https://ash-inspection-app-production.up.railway.app/health` → `{"ok":true}`
- Logs: Railway dashboard → ash-inspection-app → Deployments → View logs
- Env vars: Railway dashboard → ash-inspection-app → Variables
- Redeploy: automatic on every `git push` to `main`
- LibreOffice is included in the Docker container — PDF generation works in production

**Local server (development only):**
```
cd C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\server
npm run dev
```

**Restarting cleanly** (use this instead of Ctrl+C to avoid port-in-use errors):
```
npm run restart
```
This kills port 3001 and restarts in one step. tsx watch spawns child processes that don't die cleanly with Ctrl+C on Windows — `npm run restart` handles this properly.

**If port 3001 is stuck and npm run restart fails**, Claude can run this PowerShell command:
```
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -Force
```

**Cloudflared tunnel** — no longer needed for field tests now that Railway is live.
Was used pre-deployment when server ran locally.

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
│   ├── services/               # anthropic.ts, supabase.ts, reportGenerator.ts, email.ts, pdf.ts
│   ├── prompts/                # classify.ts, analyseImage.ts, processObservation.ts, generateSummary.ts
│   └── config/models.ts        # Model names — single source of truth
└── supabase/
    └── migrations/             # Run in order — check numbering before adding new ones
```
