// On-site database backup — wraps pg_dump to write a timestamped SQL dump of
// the Supabase Postgres database into a local directory.
//
// ┌─ NOT SCHEDULED ───────────────────────────────────────────────────────────┐
// │ This is dormant infrastructure. It does not run automatically. Wire it     │
// │ into Windows Task Scheduler (or cron) only once an on-site backup machine  │
// │ exists. See docs/on-site-backup.md for setup, scheduling and restore.      │
// └────────────────────────────────────────────────────────────────────────────┘
//
// Usage:    node --env-file=.env scripts/backup-database.mjs
//   or:     npm run backup-db
//
// Requires: pg_dump on PATH (install the PostgreSQL 15+ client tools), plus in
//           server/.env:
//             SUPABASE_DB_URL  — direct Postgres connection URI (Supabase
//                                dashboard → Settings → Database → Connection
//                                string → URI)
//             BACKUP_DIR       — local directory to write backups into
//                                (use an encrypted drive — see the runbook)

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

const DB_URL     = process.env.SUPABASE_DB_URL
const BACKUP_DIR = process.env.BACKUP_DIR
const KEEP_LAST  = 30   // prune SQL dumps older than the most recent N

if (!DB_URL) {
  console.error('[BACKUP-DB] SUPABASE_DB_URL not set — add it to server/.env. See docs/on-site-backup.md')
  process.exit(1)
}
if (!BACKUP_DIR) {
  console.error('[BACKUP-DB] BACKUP_DIR not set — add it to server/.env. See docs/on-site-backup.md')
  process.exit(1)
}

const dbDir = join(BACKUP_DIR, 'db')
await mkdir(dbDir, { recursive: true })

const stamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outFile = join(dbDir, `ash-inspection-db-${stamp}.sql`)

console.log(`[BACKUP-DB] Dumping database to ${outFile}`)

try {
  // --no-owner / --no-privileges keep the dump portable — it can be restored
  // into any Postgres without needing the original roles to exist. pg_dump
  // reads the password from the connection URI.
  await execFileAsync(
    'pg_dump',
    [DB_URL, '--no-owner', '--no-privileges', '--file', outFile],
    { maxBuffer: 1024 * 1024 * 64 },
  )
} catch (err) {
  console.error('[BACKUP-DB] pg_dump failed:', err.message)
  console.error('  Check pg_dump is installed and on PATH, and SUPABASE_DB_URL is correct.')
  console.error('  The local pg_dump major version must be >= the Supabase Postgres version.')
  process.exit(1)
}

const { size } = await stat(outFile)
console.log(`[BACKUP-DB] Wrote ${(size / 1024 / 1024).toFixed(1)} MB`)

// Prune the oldest dumps beyond KEEP_LAST. Filenames sort chronologically
// because the timestamp is ISO-ordered.
const dumps = (await readdir(dbDir))
  .filter(f => f.startsWith('ash-inspection-db-') && f.endsWith('.sql'))
  .sort()

if (dumps.length > KEEP_LAST) {
  for (const f of dumps.slice(0, dumps.length - KEEP_LAST)) {
    await unlink(join(dbDir, f)).catch(() => {})
    console.log(`[BACKUP-DB] Pruned old dump ${f}`)
  }
}

console.log('[BACKUP-DB] Done')
