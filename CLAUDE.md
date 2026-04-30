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
| 4 | ⬜ Next | Full sync queue, photo upload, Opus image analysis |
| 5 | ⬜ | Report generation, Word/PDF, email |
| 6 | ⬜ | Section review, inspection summary, report preview, polish |

---

## Project structure

```
ash-inspection-app/
├── app/              # React + Capacitor frontend
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── services/   # API clients, Supabase, Deepgram, classify
│   │   ├── db/         # SQLite local database
│   │   ├── hooks/
│   │   ├── contexts/
│   │   └── config/models.ts  # Model routing — only place model names appear
│   └── android/      # Capacitor Android project
├── server/           # Node.js Express backend
│   ├── routes/
│   ├── services/     # Anthropic API calls
│   ├── prompts/      # All AI prompts as exported strings
│   └── config/models.ts
└── supabase/         # DB migrations and seed data
```
