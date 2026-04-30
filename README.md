# ASH Inspection App

A mobile-first property inspection tool for ASH Chartered Surveyors. Inspectors record voice narrations during site visits; the app transcribes, classifies, and processes them into a professionally formatted Word report delivered by email.

Built with React + Capacitor for Android. Offline-first — inspections are recorded to local SQLite and synced to Supabase when connectivity is available.

---

## Features

- **Voice recording** — hold to record narrations, release to transcribe via Deepgram Nova-3
- **AI classification** — Sonnet automatically assigns each narration to the correct report section
- **Camera** — photos captured during inspection are linked to observations and embedded in the report
- **Offline-first** — full inspection recording works without connectivity; sync happens automatically when back online
- **Opus image analysis** — after sync, each photo is analysed by claude-opus-4-6 and a professional caption generated
- **Report generation** — one tap produces a branded Word document matching the ASH inspection report template, delivered by email

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Native | Capacitor 6 (Android) |
| Local DB | SQLite via @capacitor-community/sqlite |
| Backend | Node.js + Express |
| Cloud DB | Supabase (PostgreSQL + Storage + Auth) |
| Transcription | Deepgram Nova-3 |
| AI — image analysis | claude-opus-4-6 |
| AI — all text tasks | claude-sonnet-4-6 |
| Email | Resend |

---

## Build status

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ | Auth, property list, Supabase schema |
| 2 | ✅ | Audio recording, transcription, SQLite, camera |
| 3 | ✅ | AI classification, section picker, low-confidence banner |
| 4 | ✅ | Sync queue, photo upload, Opus analysis, sync indicator |
| 5 | ✅ | Observation processing, AI summary, Word report, email delivery |
| 6 | ⬜ | Section review, inspection summary, report preview, polish |

---

## Project structure

```
ash-inspection-app/
├── app/                    # React + Capacitor frontend
│   ├── src/
│   │   ├── components/     # RecordButton, ObservationFeedItem, SectionPicker
│   │   ├── screens/        # ActiveInspectionScreen, PropertyListScreen, PropertyDetailScreen
│   │   ├── services/       # sync, classify, transcription, report, supabase
│   │   ├── db/             # SQLite local database
│   │   ├── hooks/          # useSync, useNetwork
│   │   └── config/         # models.ts — single source of truth for model names
│   └── android/            # Capacitor Android project
├── server/                 # Node.js Express backend
│   ├── routes/             # classify, analysePhoto, generateReport
│   ├── services/           # anthropic, supabase, reportGenerator, email
│   ├── prompts/            # All AI prompts as separate TypeScript files
│   └── config/             # models.ts
├── supabase/
│   └── migrations/         # Database migrations — run in order
├── CLAUDE.md               # Developer setup guide and session instructions
└── README.md
```

---

## Developer setup

See [CLAUDE.md](CLAUDE.md) for full setup instructions including:
- Home vs work environment checklists
- Cloudflare tunnel setup for field testing over mobile data
- Environment variables required
- Build and install steps for Android

---

## Environment variables

Two files are required and are not committed to git:

**`server/.env`**
```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
RESEND_API_KEY=
REPORT_TO_OVERRIDE=    # dev only — routes all emails to this address
PORT=3001
```

**`app/.env.local`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=     # local IP or Cloudflare tunnel URL
VITE_DEEPGRAM_API_KEY=
```

---

## Important notes

- **iOS not yet supported** — Android only. iOS requires macOS + Xcode + Apple Developer account.
- **Model routing** — image analysis always uses `claude-opus-4-6`; all text tasks use `claude-sonnet-4-6`. Model names are defined only in `config/models.ts` files and never hardcoded elsewhere.
- **Server required** for classification, photo analysis, and report generation. The server must be reachable from the device — use a Cloudflare tunnel for field testing.
- **Pre-production**: Deepgram key is currently in the frontend bundle and should be moved to the backend before go-live.
