import { Database } from "bun:sqlite";
import { config } from "../config.ts";
import { mkdirSync } from "fs";
import { dirname } from "path";

// Ensure data directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath, { create: true });

// Enable WAL mode for better concurrent access
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    title TEXT,
    transcript TEXT,
    audio_path TEXT,
    audio_duration_seconds REAL,
    status TEXT NOT NULL DEFAULT 'pending_transcription',
    -- pending_transcription, transcribed, analyzed
    analysis_json TEXT,
    follow_up_questions TEXT, -- JSON array of follow-up questions from Claude
    agent_trajectory TEXT -- JSON of agent conversation for debugging/review
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entry_tags (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS entry_links (
    source_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    relationship TEXT, -- e.g., 'references', 'continues', 'contradicts'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (source_id, target_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_entry_tags_tag_id ON entry_tags(tag_id);

  -- Cache for expensive computed values (e.g., interview questions)
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    depends_on TEXT, -- ID of entity this cache depends on (e.g., HEAD entry ID)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Settings for user preferences and global configuration
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: Add agent_trajectory column if it doesn't exist
try {
  db.exec("ALTER TABLE entries ADD COLUMN agent_trajectory TEXT");
} catch {
  // Column already exists, ignore
}

// Migration: Add bi-directional description columns to entry_links
try {
  db.exec(
    "ALTER TABLE entry_links ADD COLUMN source_to_target_description TEXT"
  );
} catch {
  // Column already exists, ignore
}
try {
  db.exec(
    "ALTER TABLE entry_links ADD COLUMN target_to_source_description TEXT"
  );
} catch {
  // Column already exists, ignore
}

export type EntryStatus = "pending_transcription" | "transcribed" | "analyzed";

export interface Entry {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  transcript: string | null;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  status: EntryStatus;
  analysis_json: string | null;
  follow_up_questions: string | null;
  agent_trajectory: string | null;
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface EntryLink {
  source_id: string;
  target_id: string;
  relationship: string | null; // Deprecated, kept for backward compatibility
  source_to_target_description: string | null; // How source relates to target
  target_to_source_description: string | null; // How target relates to source
  created_at: string;
}

// Transaction helper - executes a function within a transaction
// If the function throws, the transaction is rolled back
export function withTransaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
