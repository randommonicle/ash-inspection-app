# Next Session — Pick-up Notes

> **2026-05-13 end-of-day update:** Almost everything in this file has been shipped — v0.2.3 is live on Railway and the signed APK is on GitHub. See the new top-of-file section directly below for what's outstanding. The original handover notes are retained beneath for traceability.

---

## 0. Outstanding from 2026-05-13 evening

### 0a. In-app updater hangs at 100% download

**Symptom:** When the auto-update prompt appears and the user taps Download, the APK reaches 100% downloaded but the install dialog never appears — it just sits there.

**Likely causes** (most → least probable):

1. **`window.open(apkUrl, '_blank')` is resolving inside the Capacitor WebView**, not Chrome Custom Tab. The WebView downloads the bytes but has no concept of "install APK", so it stalls. Fix: swap for Capacitor's `Browser.open({url})` plugin — guarantees external handoff.
2. **"Install unknown apps" permission** not granted to the browser/source. Even with Custom Tab working, Android won't pop the install dialog until the source has this permission. One-time grant per source.
3. Combination of both — the first one fails silently and there's no fallback to the second.

**First diagnostic step next session:** open Files app → Downloads folder on the device. If the APK is sitting there, the download succeeded and it's a permission issue; if it's not there, the download is stuck inside the WebView sandbox and needs the plugin swap.

**Plan B if Plan A doesn't fix it:** download the APK via `Filesystem` plugin to the public Downloads directory, then use a file-opener plugin (`@capacitor-community/file-opener` or similar) to fire an `Intent.ACTION_VIEW` against the APK — that's the path the Android package installer expects. Needs `REQUEST_INSTALL_PACKAGES` in AndroidManifest.xml.

**Files involved:**
- [`app/src/hooks/useUpdateCheck.ts`](app/src/hooks/useUpdateCheck.ts)
- [`app/src/components/UpdatePrompt.tsx`](app/src/components/UpdatePrompt.tsx)

**Effort:** ~30 min for Plan A. ~half a day for Plan B if needed.

### 0b. Audit remediation (when ready to move toward commercial launch)

The independent audit of v0.2.3 (13 May 2026) returned **AMBER**. Three Hard Stops block commercial launch:

1. MFA on Supabase Auth
2. Documented DPIA
3. Supabase paid-tier upgrade with verified PITR

Plus four Red Flags (signed DPAs with US processors, written LIA, in-app Transparency Notice for AI use, sole-developer responder model).

Full breakdown in `audit/ASH_Inspection_App_Audit_Report.docx` and memory file `project_ash_audit_remediation.md`. The statutory hook is the **UK DPA 2026 (Code of Practice on AI and Automated Decision-Making) Regulations**, in force 12 May 2026.

Don't tackle these in a bug-squash session — they want their own focused chunk of work.

### 0c. Admin dashboard — remove vestigial `report_pdf_url`

The PDF report copy was dropped on 2026-05-14 (commit `ac86bf8`). `server/routes/admin.ts` still queries a `report_pdf_url` column and renders a "PDF" link in the Recent Inspections table — but that column was **never written** (only `report_docx_url` is set), so the link has always shown "—". Harmless, but tidy it up next time the dashboard is touched: drop `report_pdf_url` from the `/api/inspections/recent` select and remove the `pdfLink` block from `loadRecent()`. Low priority, cosmetic.

### 0d. Soft in-app photo counter (queued — needs the next APK release)

The server-side photo-volume protection is **done** (2026-05-14): adaptive compression by photo count (`resizeTier` in `generateReport.ts`) plus a Supabase Storage download-link fallback in `email.ts` for anything still over Resend's 40 MB cap. Reports now always send, no photo limit.

Still to do — a **soft in-app photo counter** so PMs are aware when they're taking a lot of photos. Pure awareness, no blocking:
- Show a running count somewhere on `ActiveInspectionScreen.tsx` (e.g. "47 photos" near the camera button or in the header).
- Optional: gentle colour shift past ~50 (amber) so it reads as "you're taking a lot" without nagging.
- No hard cap — decision was explicitly *not* to block PMs mid-inspection; the server handles any volume.

App-side change, so it ships with the next APK release — bundle it with the camera-loop / Feedback-rename release if those haven't gone out yet.

### 0e. On-site backup infrastructure (built, DORMANT — not scheduled)

Scripts + runbook are in the repo as of 2026-05-14 but **nothing runs them automatically**:
- `server/scripts/backup-database.mjs` — `pg_dump` wrapper → timestamped SQL dumps
- `server/scripts/backup-storage.mjs` — incremental mirror of the `inspection-files` Storage bucket
- `docs/on-site-backup.md` — full runbook (prerequisites, scheduling, restore, caveats)
- `npm run backup-db` / `npm run backup-storage` aliases in `server/package.json`

To **activate**: someone at ASH sets up an on-site machine (Node + PostgreSQL client tools + encrypted backup drive), adds `SUPABASE_DB_URL` + `BACKUP_DIR` to that machine's `server/.env`, and schedules the two commands via Task Scheduler. Full steps in the runbook. Do **not** schedule from Railway — backups run from on-site only. Once active + a restore is tested, the 12-month retention window in `cleanup.ts` can safely be shortened.

---

## (Original notes below — most items shipped on 2026-05-13)

---

## 1. Required manual step (blocks bug tracker in production)

Run [supabase/migrations/20260513000001_bug_report_status_tracking.sql](supabase/migrations/20260513000001_bug_report_status_tracking.sql) in the Supabase SQL Editor:
https://supabase.com/dashboard/project/yvjxcvnlapfikzovzgwd/sql/new

Copy the file contents, paste into the editor, hit Run. ~5 seconds.

Without this, the new bug-tracker lifecycle UI (live in code as of commit `02e99dc`) will fail to load the bug list, and the in-app My Reports screen will return an empty list because RLS blocks the reporter SELECT.

---

## 2. Approved work, not yet started

### 2a. Rename "Report issue" → "Feedback"
Trivial copy change. Encourages PMs to submit suggestions, not just bug reports — both flow through the same lifecycle now.

**Files:**
- [app/src/components/BugReportModal.tsx](app/src/components/BugReportModal.tsx) — button label, modal title
- [app/src/screens/PropertyListScreen.tsx](app/src/screens/PropertyListScreen.tsx) — the "Report issue" link in the header
- [server/routes/admin.ts](server/routes/admin.ts) — tab label "Bug Reports" → "Feedback" (search for "Bug Reports &amp; Suggestions")

**Effort:** ~10 min.

### 2b. Camera loop UX fix
After taking a photo and tapping OK on the native confirm prompt, the camera should re-open immediately so PMs walking large sites can take photo after photo without going back to the section view and tapping the camera button each time. The native back/cancel button on the camera UI exits the loop and returns to the section view.

**File:** [app/src/screens/ActiveInspectionScreen.tsx](app/src/screens/ActiveInspectionScreen.tsx) — `handleCamera` starts at line 289.

**How to apply:** wrap the `Camera.getPhoto()` call in a `while (true)` loop. Existing code at line 326 already detects cancel via `err.message.includes('cancelled')` — use that to break the loop.

**Watch out for:**
- `lastObs = observations[observations.length - 1]` closure staleness. Re-read `observations` inside the loop (use a ref) or accept that all looped photos link to the same observation (probably the desired behaviour for a "burst" of shots for one observation anyway).
- Memory if a PM takes 50+ photos in one go — each writes to Documents directory. Probably fine on modern Pixels.
- React state batching while the camera UI is in the foreground. Photos still save to SQLite individually so no data loss; the feed re-renders correctly once the user finally cancels out.

**Effort:** ~30 min including a device test.

### 2c. Auto-delete local photos after report generation
Once the report has been emailed successfully, delete the JPEG files from `Directory.Documents` and the `photos` rows from local SQLite for that inspection. Photos are already in Supabase Storage; report regeneration downloads from there server-side, so local copies are pure UI cache.

**Files:**
- [app/src/db/database.ts](app/src/db/database.ts) — add `deletePhotosForInspection(inspectionId)`
- New file: `app/src/services/cleanup.ts` (or extend `sync.ts`) — `freeLocalPhotos(inspectionId)` that does Filesystem.deleteFile for each + the SQLite cleanup atomically
- [app/src/screens/PropertyDetailScreen.tsx](app/src/screens/PropertyDetailScreen.tsx) — call it right after `await markReportSent(inspectionId)` in the success branch of the report-generation flow

**UX:**
- Silent cleanup + toast: "Photos archived to cloud — N MB freed". No confirmation dialog — PM just generated a report, another modal would feel pestering.
- For already-generated inspections (`status='report_generated'`), the photo strip on PropertyDetailScreen will now have nothing to render. Replace it with a "Photos archived" indicator — simpler than lazy-loading thumbnails back from Supabase Storage. Lazy-load can be a follow-up if anyone misses being able to flick through old photos on-device.

**Defensive checks before deleting:**
- Verify `synced=1` on every photo for that inspection. Skip cleanup with a console warning if any are unsynced (shouldn't happen — Generate Report button is gated on sync — but defend in depth).
- Wrap each `Filesystem.deleteFile` in try/catch in case the file is already gone.

**Effort:** ~half a day.

### 2d. HTML report as third delivery format
Email a self-contained HTML version of the report alongside the DOCX and PDF. Read-only, client-facing, with native click-to-enlarge via an inline lightbox or `<a target="_blank">` wrapping each photo. Solves the click-to-enlarge ask without Supabase signed URLs / link rot.

**Files:**
- New: `server/services/htmlReportGenerator.ts` — parallel to `reportGenerator.ts`, consumes the same `ReportData` shape
- [server/routes/generateReport.ts](server/routes/generateReport.ts) — call the new renderer alongside the DOCX, pass to email
- [server/services/email.ts](server/services/email.ts) — accept a third `htmlBuffer` attachment

**Design notes:**
- Photos as base64 inline → file is fully self-contained, no Supabase dependency for the click-to-enlarge. Watch the total size: ~13 MB for a 20-photo report (base64 inflates 33%). Resend's 40 MB cap still holds with DOCX + PDF + HTML for typical inspections.
- Use `Source Serif 4` + `Inter` web fonts (matches the GCC template style) — load from Google Fonts at the top of the HTML.
- Print CSS so clients can browser-print to PDF if they want.
- Visual cues should match the existing ASH navy/steel branding from `project_ash_branding.md` — `#1c3f5e` navy, `#7aafc5` steel blue.

**Tax to be aware of:** every layout change now needs to update DOCX builder *and* HTML renderer. Two templates to keep in sync.

**Effort:** 1–2 days.

---

## 3. Deferred — do NOT build as proposed

**Editable PM "mini-app" embedded in the report file** — original ask was for drag-drop photos, action-item tickoffs, audit trail, browser-localStorage save, server sync, all inside the HTML report. Decided this is mis-shaped: an inspection report is a snapshot in time, not a workflow. The action-tracking is real value but belongs as a Phase 7 in-app **Action Items** screen (offline-first SQLite, syncs to Supabase, persists across reports), not as state embedded in a downloadable HTML file. Don't accept a request to build this into the report renderer — push back and offer the in-app version instead.

---

## 4. Already shipped today (2026-05-13)

Don't redo these — they're live on Railway (or live in code awaiting next APK release for the client-side bits).

| Commit | What |
|--------|------|
| `9845fe6` | Photo resize via sharp (2048 px, JPEG q82) — fixed 40 MB email cap |
| `288807c` | Docs for the resize fix |
| `3dda0d3` | Inspector title now reads `users.job_title` on cover page (was hardcoded "Senior Property Manager") |
| `23b9814` | Photo aspect-ratio fix — no more 4:3 squashing of portrait shots |
| `31b92e3` | `ENABLE_PHOTO_HYPERLINKS` env flag (off by default — agreed PDF zoom is enough) |
| `02e99dc` | Bug-tracker lifecycle: status / resolution / dedup / My Reports screen + admin editor UI |
| (this) | This NEXT_SESSION.md file |

Backfilled all 14 photos for Nick's H53 inspection that had failed Opus analysis at capture time.

Two outstanding things from already-shipped work:
- The bug-tracker lifecycle needs the SQL migration (see §1)
- The My Reports screen / dedup hint / "Feedback" rename only reach inspectors on the next APK release — bump `app/package.json` version + `versionCode`/`versionName`, build & sign, GitHub release, update Railway `APP_VERSION` / `APK_URL` / `RELEASE_NOTES`. See README §9.

---

## 5. Suggested order at home

1. **Apply SQL migration** (§1) — 1 min, unblocks production
2. **Rename to Feedback** (§2a) — bundle with #3 if doing them together
3. **Camera loop** (§2b) — small, satisfying win to start the session
4. **Auto-delete photos** (§2c) — half day
5. **HTML report renderer** (§2d) — biggest, save for a fresh start

After #2–#4 are in, cut a new APK release (versions 0.2.2 or similar) so PMs get all the camera, feedback, and storage improvements together.
