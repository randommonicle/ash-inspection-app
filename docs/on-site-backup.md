# On-Site Backup Runbook

> **Status: DORMANT — not active.** The scripts exist and are ready, but nothing
> runs them automatically. They are activated only when an on-site backup
> machine has been set up at ASH. Until then this document is a standing plan.

## 1. Purpose and principle

This is a **one-way backup pull** — an independent copy of the inspection
system's data, held on-site at ASH, for two reasons:

- **Preservation** — a copy that survives a Supabase outage, an account issue,
  accidental deletion, or the 12-month retention cron removing old inspections.
- **Data control** — a copy under ASH's direct physical custody, which
  strengthens the DPIA / audit position.

**Key principle:** the on-site machine is a *backup target*, never load-bearing
infrastructure. Nothing in the live system depends on it. If it is switched
off, on holiday, or broken, **nothing breaks** — the next run simply catches
up. This is the opposite of "host the backend / storage on a tower" (rejected —
that puts an office machine in the critical path of field devices on 4G).

This is a **copy, not a migration.** Supabase remains the live system of record.

## 2. What gets backed up

| Script | Source | Captures |
|--------|--------|----------|
| `scripts/backup-database.mjs` | Supabase Postgres (via `pg_dump`) | All inspections, observations, photo records, users, properties, bug reports, API usage log — the full relational dataset |
| `scripts/backup-storage.mjs` | Supabase Storage bucket `inspection-files` | Every inspection photo, plus the generated `report.docx` and `report.html` per inspection |

Output layout under `BACKUP_DIR`:

```
BACKUP_DIR/
├── db/
│   ├── ash-inspection-db-2026-05-14T03-00-00.sql
│   └── ...                                    (last 30 dumps kept; older pruned)
└── storage/
    └── {property_id}/{inspection_id}/{files}   (mirrors the bucket structure)
```

## 3. Prerequisites (one-time, on the on-site machine)

1. **Node.js 20+** — same as the server requires.
2. **PostgreSQL client tools** — provides `pg_dump`. Install PostgreSQL 15+ (the
   client tools alone are enough; the full server is not needed). Ensure
   `pg_dump` is on the system `PATH`.
   - The local `pg_dump` major version must be **>=** the Supabase Postgres
     version, or the dump will refuse to run.
3. **A backup drive** — ideally an **encrypted** external drive or an encrypted
   folder on a NAS. The backup is a pile of personal data (inspection photos,
   names, addresses); an unencrypted copy in a drawer makes the compliance
   position *worse*, not better.
4. A clone of this repo with `npm ci` run in `server/` (the storage script uses
   the already-installed `@supabase/supabase-js`).

## 4. One-time configuration

Add to `server/.env` on the on-site machine (these are **not** set on Railway —
backups run from on-site only):

```
SUPABASE_DB_URL=postgresql://...     # Supabase dashboard → Settings → Database → Connection string → URI
BACKUP_DIR=D:\ASH_Backups            # path to the encrypted backup drive/folder
```

`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already in `server/.env` and are
reused by the storage script.

## 5. Running manually

From the `server/` directory:

```
npm run backup-db        # pg_dump → BACKUP_DIR/db/ash-inspection-db-<timestamp>.sql
npm run backup-storage   # mirror the bucket → BACKUP_DIR/storage/...
```

The storage script is **incremental** — after the first full mirror, repeat
runs only download new or changed files.

> **First-run egress warning:** the initial storage mirror downloads the entire
> bucket. On the Supabase **free tier** (5 GB/month egress) a full mirror can
> exceed the monthly allowance in one go. Either run the first mirror right
> after a monthly egress reset, or do it once on Supabase **Pro** (250 GB
> egress). Incremental runs afterwards are small.

## 6. Scheduling (when activating)

On Windows, use **Task Scheduler**:

1. Create a task, e.g. "ASH Inspection Backup".
2. Trigger: daily (database) — overnight, e.g. 02:30. Weekly is fine for storage
   if egress is a concern; daily once on Pro.
3. Action: `Start a program`
   - Program: `node`
   - Arguments: `--env-file=.env scripts/backup-database.mjs`
   - Start in: the absolute path to the `server/` directory
4. Repeat for `scripts/backup-storage.mjs`.
5. Tick "Run whether user is logged on or not".

(On Linux/macOS the equivalent is a `cron` entry — same two commands.)

## 7. Restore procedure

**Database** — restore a `.sql` dump into any Postgres (a fresh Supabase
project, a local Postgres, etc.):

```
psql "<target-connection-string>" --file ash-inspection-db-<timestamp>.sql
```

The dump is taken with `--no-owner --no-privileges`, so it restores cleanly
without needing the original Supabase roles to exist.

**Storage** — `BACKUP_DIR/storage/` mirrors the bucket's path structure
(`{property_id}/{inspection_id}/{files}`). To restore, upload the tree back
into a Supabase Storage bucket of the same name, preserving paths — the Supabase
dashboard, CLI, or a short upload script will do it.

> **Test the restore.** A backup that has never been restored is not a known-good
> backup. Do a test restore of both the DB dump and a sample of the storage tree
> at least once after activating, and periodically thereafter. The audit will
> expect evidence of a tested restore, not just a script that runs.

## 8. How this interacts with the retention cron

`server/services/cleanup.ts` deletes Supabase Storage files for inspections
older than 12 months. Once the on-site archive is **active and verified**, that
retention window can safely be shortened to keep the live Supabase tier lean —
the on-site copy becomes the long-term system of record, while Supabase holds
only the recent working set. Do not shorten the retention window until the
on-site backup is confirmed working and a restore has been tested.

## 9. Caveats summary

- It is a **copy, not a migration** — Supabase stays live.
- **Encrypt** the backup drive — it holds personal data.
- **Test restores** — untested backups are not backups.
- Mind **free-tier egress** on the first storage mirror.
- Someone at ASH must **own** it — confirm the scheduled task still runs and the
  drive is not full. Low burden, not zero.
