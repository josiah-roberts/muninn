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
    follow_up_questions TEXT -- JSON array of follow-up questions from Claude
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
`);

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
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface EntryLink {
  source_id: string;
  target_id: string;
  relationship: string | null;
  created_at: string;
}
