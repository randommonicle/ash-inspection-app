# ASH Inspection App — Claude Code Guide

## First thing: establish the environment

At the start of every session, ask the user:
**"Are you on your home computer or work computer?"**

Then walk through the relevant checklist below before doing anything else.

---

## Home computer setup

**Backend server**
- Working directory: `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\server`
- Start: `npm run dev` (leave this terminal open)
- Runs on: `http://localhost:3001`
- Env file: `server/.env` (contains ANTHROPIC_API_KEY)

**Frontend dev server**
- Working directory: `C:\Users\bengr\OneDrive\Desktop\ash-inspection-app\app`
- Start: `npm run dev` (leave this terminal open)
- Runs on: `http://localhost:5173`

**API base URL**
- `app/.env.local` → `VITE_API_BASE_URL=http://192.168.1.108:3001`
- 192.168.1.108 is the home PC's local IP — confirm with `ipconfig` if the phone can't reach the server
- If the IP has changed, update `app/.env.local` and rebuild the app

**Android device testing**
- Phone and PC must be on the same WiFi network
- Kaspersky VPN and Firewall must be disabled for WiFi debugging to work
- Open Android Studio → device should appear in the Running Devices panel
- After any code change: `npm run build` → `npx cap sync android` → Run in Android Studio
- The app must be rebuilt and reinstalled for any frontend or `.env.local` changes to take effect

**Browser testing**
- No rebuild needed for server-only changes
- Frontend changes require `npm run build` and reinstall on device, but can be previewed at `http://localhost:5173` in the browser

---

## Work computer setup

**Backend server**
- Working directory: `[work machine path]\ash-inspection-app\server`
- Start: `npm run dev`
- Runs on: `http://localhost:3001`

**Cloudflare Tunnel (required for device testing at work)**
- Start tunnel: `cloudflared tunnel --url http://localhost:3001`
- Copy the generated `https://*.trycloudflare.com` URL
- Update `app/.env.local` → `VITE_API_BASE_URL=https://[your-tunnel-url]`
- Rebuild the app: `npm run build` → `npx cap sync android`
- Note: the tunnel URL changes on every restart unless a named tunnel is configured

**Android device testing**
- USB debugging or WiFi debugging via Android Studio
- Device connects via Cloudflare Tunnel URL (not localhost)

---

## Key things to remember

- **Both terminal windows must stay open** while developing — closing them stops the server or frontend
- **Rebuild required** after any change to `.env.local` or frontend source files before testing on device
- **Server hot-reloads** automatically when server files change (tsx watch) — but restart manually if it doesn't pick up changes
- **API keys** live in `server/.env` (never committed) and `app/.env.local` (never committed)
- **Model routing is a hard rule**: image analysis = `claude-opus-4-6`, everything else = `claude-sonnet-4-6`. Defined in `server/config/models.ts` and `app/src/config/models.ts` only — never hardcode model names elsewhere

---

## Build phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Supabase, auth, property list |
| 2 | ✅ Done | Recording, transcription, SQLite, camera |
| 3 | ✅ Done | AI classification, section picker, low-confidence banner |
| 4 | ✅ Done | Full sync queue, photo upload, Opus image analysis, sync status indicator |
| 5 | ⬜ Next | Report generation, Word/PDF, email via Resend |
| 6 | ⬜ | Section review, inspection summary, report preview, polish |

---

## Phase 4 — what was built and how it works

**Sync flow** (`app/src/services/sync.ts`):
1. On inspection complete, `triggerSync()` is called
2. `syncPendingInspections()` fetches all local inspections with `status = 'completed'` and `synced_at IS NULL`
3. For each inspection: upsert inspection record → upsert observations → upload photos to Supabase Storage
4. After each photo upload, calls `POST /api/analyse-photo` on the backend server
5. Server downloads the photo from Storage, runs it through claude-opus-4-6, saves the description JSON back to the `photos` table
6. Inspection marked as synced in local SQLite DB

**Sync status indicator** (`app/src/hooks/useSync.ts`):
- `useSync()` hook exposes `{ status, triggerSync }`
- Status: `idle | syncing | queued | error`
- Auto-syncs when network comes back online via `Network.addListener`
- Colour-coded dot in ActiveInspection top bar (green/blue-pulsing/amber/red)

**Supabase Storage RLS** — the `inspection-files` bucket requires two policies:
- `INSERT` for authenticated users (allows app to upload)
- `SELECT` for authenticated users (allows server to download for Opus analysis)
- If uploads fail with "violates row-level security policy", check these policies exist in Supabase → Storage → inspection-files → Policies

**Known security issues to fix before production** (not blocking for development):
- Deepgram API key is in `app/.env.local` (exposed in frontend bundle) — move transcription to backend server
- `android:usesCleartextTraffic="true"` and `allowMixedContent: true` in Capacitor config — remove when using HTTPS in production
- CORS on the server is wide open (`*`) — restrict to known origins before production

---

## Phase 5 — what needs building next

Report generation from a completed, synced inspection:

1. **Observation processing** — for each observation, call Sonnet to turn `raw_narration` into professional `processed_text` and optional `action_text` / `risk_level`
2. **Report summary** — call Sonnet with all processed observations to produce an overall summary and highlight recurring issues
3. **Word document** — build a `.docx` using the ASH report template (section by section, with photos, captions from Opus descriptions)
4. **Email delivery** — send the report via Resend to the property manager/client
5. **Trigger** — a "Generate Report" button on the inspection summary screen, or automatic after sync completes

Key decisions still to make:
- Does report generation happen on the server (triggered by a POST endpoint) or in a background job?
- Where does the Word template live — hardcoded in server, or stored in Supabase Storage?
- What email address does it send to — property record, or entered per inspection?

---

## Project structure

```
ash-inspection-app/
├── app/              # React + Capacitor frontend
│   ├── src/
│   │   ├── components/     # RecordButton, ObservationFeedItem, SectionPicker
│   │   ├── screens/        # ActiveInspectionScreen, PropertiesScreen, etc.
│   │   ├── services/       # sync.ts, classify.ts, transcription.ts, supabase.ts
│   │   ├── db/             # SQLite local database (database.ts)
│   │   ├── hooks/          # useSync.ts, useNetwork.ts
│   │   ├── contexts/       # AuthContext
│   │   └── config/models.ts  # Model routing — only place model names appear
│   └── android/      # Capacitor Android project
├── server/           # Node.js Express backend
│   ├── routes/       # classify.ts, analysePhoto.ts
│   ├── services/     # anthropic.ts, supabase.ts
│   ├── prompts/      # classify.ts, analyseImage.ts — all AI prompts here
│   └── config/models.ts
└── supabase/         # DB migrations and seed data
    └── migrations/   # Run in order — check numbering before adding new ones
```
