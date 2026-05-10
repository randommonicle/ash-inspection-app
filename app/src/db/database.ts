// Local SQLite database for offline-first inspection storage.
//
// All inspection data (inspections, observations, photos) is written here first.
// The sync service reads from here and upserts to Supabase when connectivity allows.
//
// Schema changes: add new ALTER TABLE statements to the `migrations` array at the
// bottom of initDatabase(). Do NOT change DB_VERSION or recreate tables — SQLite
// on Android does not migrate automatically and users would lose local data.
//
// This module is the ONLY place that talks to SQLite. All other files import
// the exported functions and never touch sqliteConn directly.

import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { LocalInspection, LocalObservation, LocalPhoto, PendingTranscription, SectionKey } from '../types'

const DB_NAME    = 'ash_inspections'
const DB_VERSION = 1

const CREATE_TABLES = `
  PRAGMA foreign_keys=ON;

  CREATE TABLE IF NOT EXISTS inspections (
    id               TEXT PRIMARY KEY NOT NULL,
    property_id      TEXT NOT NULL,
    property_ref     TEXT NOT NULL,
    property_name    TEXT NOT NULL,
    property_address TEXT NOT NULL,
    inspector_id     TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',
    start_time       TEXT NOT NULL,
    end_time         TEXT,
    synced           INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS observations (
    id                  TEXT PRIMARY KEY NOT NULL,
    inspection_id       TEXT NOT NULL,
    property_id         TEXT NOT NULL,
    section_key         TEXT NOT NULL DEFAULT 'additional',
    template_order      INTEGER NOT NULL DEFAULT 12,
    raw_narration       TEXT,
    processed_text      TEXT,
    action_text         TEXT,
    risk_level          TEXT,
    classification_conf TEXT,
    synced              INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS photos (
    id            TEXT PRIMARY KEY NOT NULL,
    observation_id TEXT,
    inspection_id  TEXT NOT NULL,
    local_path     TEXT NOT NULL,
    web_path       TEXT,
    caption        TEXT,
    section_key    TEXT,
    synced         INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pending_transcriptions (
    id            TEXT PRIMARY KEY NOT NULL,
    inspection_id TEXT NOT NULL,
    audio_path    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
  );
`

const sqliteConn = new SQLiteConnection(CapacitorSQLite)
let db: SQLiteDBConnection | null = null

export async function initDatabase(): Promise<void> {
  const isConn = (await sqliteConn.isConnection(DB_NAME, false)).result
  if (isConn) {
    db = await sqliteConn.retrieveConnection(DB_NAME, false)
  } else {
    db = await sqliteConn.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
  }
  await db.open()
  // journal_mode=WAL returns a result set so must use query(), not execute()
  await db.query('PRAGMA journal_mode=WAL', [])
  await db.execute(CREATE_TABLES)

  // Additive migrations — safe to run repeatedly (ALTER TABLE IF column not exists
  // is not standard SQLite, so we catch the "duplicate column" error silently).
  const migrations = [
    `ALTER TABLE inspections ADD COLUMN report_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE photos ADD COLUMN section_key TEXT`,
  ]
  for (const sql of migrations) {
    try { await db.execute(sql) } catch { /* column already exists */ }
  }
}

function getDB(): SQLiteDBConnection {
  if (!db) throw new Error('Database not initialised — call initDatabase() first')
  return db
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─── Inspections ──────────────────────────────────────────────────────────────

export async function createInspection(params: {
  property_id: string
  property_ref: string
  property_name: string
  property_address: string
  inspector_id: string
}): Promise<LocalInspection> {
  const now = new Date().toISOString()
  const inspection: LocalInspection = {
    id: uuid(),
    ...params,
    status: 'active',
    start_time: now,
    synced: false,
    report_sent: false,
    created_at: now,
  }
  await getDB().run(
    `INSERT INTO inspections (id, property_id, property_ref, property_name, property_address, inspector_id, status, start_time, synced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [inspection.id, inspection.property_id, inspection.property_ref, inspection.property_name,
     inspection.property_address, inspection.inspector_id, inspection.status,
     inspection.start_time, inspection.created_at]
  )
  return inspection
}

export async function completeInspection(id: string): Promise<void> {
  await getDB().run(
    `UPDATE inspections SET status='completed', end_time=? WHERE id=?`,
    [new Date().toISOString(), id]
  )
}

export async function getInspectionsForProperty(property_id: string): Promise<LocalInspection[]> {
  const result = await getDB().query(
    `SELECT * FROM inspections WHERE property_id=? ORDER BY created_at DESC`,
    [property_id]
  )
  return (result.values ?? []).map(rowToInspection)
}

export async function deleteInspection(id: string): Promise<void> {
  await getDB().run(`DELETE FROM inspections WHERE id=?`, [id])
}

export async function getUnsyncedCompletedInspections(): Promise<LocalInspection[]> {
  const result = await getDB().query(
    `SELECT * FROM inspections WHERE status='completed' AND synced=0 ORDER BY created_at ASC`,
    []
  )
  return (result.values ?? []).map(rowToInspection)
}

export async function markInspectionSynced(id: string): Promise<void> {
  await getDB().run(`UPDATE inspections SET synced=1 WHERE id=?`, [id])
}

/**
 * Mark a previously-synced inspection as dirty so the next sync pass re-uploads
 * its observations and photos. Call this whenever a synced inspection is edited
 * locally (e.g. observation reassignment in the pre-report checklist) — otherwise
 * the server reads stale data from Supabase when it generates the report.
 */
export async function markInspectionUnsynced(id: string): Promise<void> {
  await getDB().run(`UPDATE inspections SET synced=0 WHERE id=?`, [id])
}

export async function getInspection(id: string): Promise<LocalInspection | null> {
  const result = await getDB().query(`SELECT * FROM inspections WHERE id=?`, [id])
  const rows = result.values ?? []
  return rows.length ? rowToInspection(rows[0]) : null
}

function rowToInspection(row: Record<string, unknown>): LocalInspection {
  return {
    id: row.id as string,
    property_id: row.property_id as string,
    property_ref: row.property_ref as string,
    property_name: row.property_name as string,
    property_address: row.property_address as string,
    inspector_id: row.inspector_id as string,
    status: row.status as 'active' | 'completed',
    start_time: row.start_time as string,
    end_time: row.end_time as string | undefined,
    synced: (row.synced as number) === 1,
    report_sent: (row.report_sent as number) === 1,
    created_at: row.created_at as string,
  }
}

export async function markReportSent(id: string): Promise<void> {
  await getDB().run(`UPDATE inspections SET report_sent=1 WHERE id=?`, [id])
}

// ─── Observations ─────────────────────────────────────────────────────────────

export async function createObservation(params: {
  inspection_id: string
  property_id: string
  section_key: SectionKey
  template_order: number
  raw_narration: string
  classification_conf: 'auto' | 'manual'
}): Promise<LocalObservation> {
  const now = new Date().toISOString()
  const obs: LocalObservation = { id: uuid(), ...params, synced: false, created_at: now }
  await getDB().run(
    `INSERT INTO observations (id, inspection_id, property_id, section_key, template_order, raw_narration, classification_conf, synced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [obs.id, obs.inspection_id, obs.property_id, obs.section_key,
     obs.template_order, obs.raw_narration, obs.classification_conf, obs.created_at]
  )
  return obs
}

export async function updateObservationSection(id: string, section_key: SectionKey, template_order: number): Promise<void> {
  await getDB().run(
    `UPDATE observations SET section_key=?, template_order=?, classification_conf='manual' WHERE id=?`,
    [section_key, template_order, id]
  )
}

export async function appendObservationNarration(
  id: string,
  extra: string,
  section_key: SectionKey,
  template_order: number,
): Promise<void> {
  // Append the new transcript to the existing narration with a space separator,
  // and update the section/confidence in case re-classification changed it.
  await getDB().run(
    `UPDATE observations
        SET raw_narration       = raw_narration || ' ' || ?,
            section_key         = ?,
            template_order      = ?,
            classification_conf = 'auto',
            synced              = 0
      WHERE id = ?`,
    [extra, section_key, template_order, id]
  )
}

export async function getObservationsForInspection(inspection_id: string): Promise<LocalObservation[]> {
  const result = await getDB().query(
    `SELECT * FROM observations WHERE inspection_id=? ORDER BY created_at ASC`,
    [inspection_id]
  )
  return (result.values ?? []).map(rowToObservation)
}

function rowToObservation(row: Record<string, unknown>): LocalObservation {
  return {
    id: row.id as string,
    inspection_id: row.inspection_id as string,
    property_id: row.property_id as string,
    section_key: row.section_key as SectionKey,
    template_order: row.template_order as number,
    raw_narration: row.raw_narration as string,
    processed_text: row.processed_text as string | undefined,
    action_text: row.action_text as string | undefined,
    risk_level: row.risk_level as 'High' | 'Medium' | 'Low' | undefined,
    classification_conf: row.classification_conf as 'auto' | 'manual' | undefined,
    synced: (row.synced as number) === 1,
    created_at: row.created_at as string,
  }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export async function createPhoto(params: {
  inspection_id: string
  observation_id?: string
  local_path: string
  web_path?: string
}): Promise<LocalPhoto> {
  const now = new Date().toISOString()
  const photo: LocalPhoto = { id: uuid(), ...params, synced: false, created_at: now }
  await getDB().run(
    `INSERT INTO photos (id, inspection_id, observation_id, local_path, web_path, synced, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [photo.id, photo.inspection_id, photo.observation_id ?? null,
     photo.local_path, photo.web_path ?? null, photo.created_at]
  )
  return photo
}

export async function deletePhoto(id: string): Promise<void> {
  await getDB().run(`DELETE FROM photos WHERE id=?`, [id])
}

export async function updatePhotoAnalysis(id: string, caption: string, sectionKey?: string): Promise<void> {
  await getDB().run(`UPDATE photos SET caption=?, section_key=? WHERE id=?`, [caption, sectionKey ?? null, id])
}

export async function getPhotosForInspection(inspection_id: string): Promise<LocalPhoto[]> {
  const result = await getDB().query(
    `SELECT * FROM photos WHERE inspection_id=? ORDER BY created_at ASC`,
    [inspection_id]
  )
  return (result.values ?? []).map(rowToPhoto)
}

function rowToPhoto(row: Record<string, unknown>): LocalPhoto {
  return {
    id: row.id as string,
    inspection_id: row.inspection_id as string,
    observation_id: row.observation_id as string | undefined,
    local_path: row.local_path as string,
    web_path: row.web_path as string | undefined,
    caption: row.caption as string | undefined,
    section_key: row.section_key as string | undefined,
    synced: (row.synced as number) === 1,
    created_at: row.created_at as string,
  }
}

// ─── Pending transcriptions ───────────────────────────────────────────────────

export async function createPendingTranscription(params: {
  inspection_id: string
  audio_path: string
}): Promise<PendingTranscription> {
  const now = new Date().toISOString()
  const pt: PendingTranscription = { id: uuid(), ...params, created_at: now }
  await getDB().run(
    `INSERT INTO pending_transcriptions (id, inspection_id, audio_path, created_at) VALUES (?, ?, ?, ?)`,
    [pt.id, pt.inspection_id, pt.audio_path, pt.created_at]
  )
  return pt
}

export async function getPendingTranscriptions(inspection_id: string): Promise<PendingTranscription[]> {
  const result = await getDB().query(
    `SELECT * FROM pending_transcriptions WHERE inspection_id=? ORDER BY created_at ASC`,
    [inspection_id]
  )
  return (result.values ?? []).map(row => ({
    id:            row.id as string,
    inspection_id: row.inspection_id as string,
    audio_path:    row.audio_path as string,
    created_at:    row.created_at as string,
  }))
}

export async function deletePendingTranscription(id: string): Promise<void> {
  await getDB().run(`DELETE FROM pending_transcriptions WHERE id=?`, [id])
}
