// On-site storage backup — mirrors the Supabase Storage 'inspection-files'
// bucket (inspection photos + generated report.docx / report.html) to a local
// directory. Incremental: an object already present locally with a matching
// size is skipped, so repeat runs only pull new or changed files.
//
// ┌─ NOT SCHEDULED ───────────────────────────────────────────────────────────┐
// │ This is dormant infrastructure. It does not run automatically. Wire it     │
// │ into Windows Task Scheduler (or cron) only once an on-site backup machine  │
// │ exists. See docs/on-site-backup.md for setup, scheduling and restore.      │
// └────────────────────────────────────────────────────────────────────────────┘
//
// Usage:    node --env-file=.env scripts/backup-storage.mjs
//   or:     npm run backup-storage
//
// Requires in server/.env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  — already present for the server
//   BACKUP_DIR                          — local directory to mirror into
//                                         (use an encrypted drive — see runbook)
//
// Note on egress: the FIRST run downloads the whole bucket, which counts
// against Supabase's monthly egress allowance (5 GB on the free tier — a full
// mirror can exceed that). Subsequent incremental runs are small. On Supabase
// Pro (250 GB egress) this is a non-issue.

import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
const BACKUP_DIR   = process.env.BACKUP_DIR
const BUCKET       = 'inspection-files'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[BACKUP-STORAGE] SUPABASE_URL / SUPABASE_SERVICE_KEY not set in server/.env')
  process.exit(1)
}
if (!BACKUP_DIR) {
  console.error('[BACKUP-STORAGE] BACKUP_DIR not set — add it to server/.env. See docs/on-site-backup.md')
  process.exit(1)
}

const supabase   = createClient(SUPABASE_URL, SERVICE_KEY)
const storageDir = join(BACKUP_DIR, 'storage')

// Supabase Storage .list() returns one directory level at a time. Folder
// entries come back with id === null; file entries have a real id. Recurse
// into folders to build a flat list of every object in the bucket.
async function listAll(prefix = '') {
  const out = []
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw new Error(`list "${prefix}": ${error.message}`)
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id === null) {
      out.push(...await listAll(path))           // folder — recurse
    } else {
      out.push({ path, size: entry.metadata?.size ?? null })
    }
  }
  return out
}

console.log(`[BACKUP-STORAGE] Listing bucket '${BUCKET}' ...`)
const objects = await listAll()
console.log(`[BACKUP-STORAGE] ${objects.length} object(s) in bucket`)

let downloaded = 0, skipped = 0, failed = 0

for (const obj of objects) {
  const localPath = join(storageDir, obj.path)

  // Incremental: skip files already present locally with a matching size.
  try {
    const local = await stat(localPath)
    if (obj.size !== null && local.size === obj.size) { skipped++; continue }
  } catch {
    // Not present locally — fall through and download.
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(obj.path)
  if (error || !data) {
    console.warn(`[BACKUP-STORAGE] FAILED ${obj.path}: ${error?.message ?? 'no data'}`)
    failed++
    continue
  }

  await mkdir(dirname(localPath), { recursive: true })
  await writeFile(localPath, Buffer.from(await data.arrayBuffer()))
  downloaded++
  if (downloaded % 25 === 0) console.log(`[BACKUP-STORAGE] ${downloaded} downloaded ...`)
}

console.log(`[BACKUP-STORAGE] Done — ${downloaded} downloaded, ${skipped} already current, ${failed} failed`)
if (failed > 0) process.exit(1)
