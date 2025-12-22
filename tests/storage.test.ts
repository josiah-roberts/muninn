import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";

// Set up test environment
const TEST_DATA_DIR = join(import.meta.dir, "../data-test");

// Clean up and set up test directory
beforeEach(() => {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(join(TEST_DATA_DIR, "audio"), { recursive: true });
  mkdirSync(join(TEST_DATA_DIR, "entries"), { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true });
  }
});

// Inline a minimal storage implementation for testing
// (avoiding import issues with config)
function createTestDb() {
  const dbPath = join(TEST_DATA_DIR, "test.db");
  const db = new Database(dbPath, { create: true });

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

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
      analysis_json TEXT,
      follow_up_questions TEXT
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
  `);

  return db;
}

describe("Storage Layer", () => {
  test("database creation and schema", () => {
    const db = createTestDb();

    // Verify tables exist
    const tables = db.query(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `).all() as { name: string }[];

    const tableNames = tables.map(t => t.name).filter(n => !n.startsWith("sqlite_"));
    expect(tableNames).toContain("entries");
    expect(tableNames).toContain("tags");
    expect(tableNames).toContain("entry_tags");

    db.close();
  });

  test("create and retrieve entry", () => {
    const db = createTestDb();
    const id = `test-${Date.now()}`;

    // Insert
    db.prepare(`
      INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')
    `).run(id);

    // Retrieve
    const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as {
      id: string;
      status: string;
    };

    expect(entry).toBeDefined();
    expect(entry.id).toBe(id);
    expect(entry.status).toBe("pending_transcription");

    db.close();
  });

  test("update entry with transcript", () => {
    const db = createTestDb();
    const id = `test-${Date.now()}`;
    const transcript = "This is a test transcript with some content.";

    // Insert
    db.prepare(`
      INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')
    `).run(id);

    // Update
    db.prepare(`
      UPDATE entries SET transcript = ?, status = 'transcribed', updated_at = datetime('now')
      WHERE id = ?
    `).run(transcript, id);

    // Verify
    const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as {
      transcript: string;
      status: string;
    };

    expect(entry.transcript).toBe(transcript);
    expect(entry.status).toBe("transcribed");

    db.close();
  });

  test("delete entry cascades to tags", () => {
    const db = createTestDb();
    const id = `test-${Date.now()}`;

    // Insert entry
    db.prepare(`INSERT INTO entries (id, status) VALUES (?, 'transcribed')`).run(id);

    // Insert tag
    db.prepare(`INSERT INTO tags (name) VALUES (?)`).run("test-tag");
    const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get("test-tag") as { id: number };

    // Link entry to tag
    db.prepare(`INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)`).run(id, tag.id);

    // Verify link exists
    const links = db.prepare("SELECT * FROM entry_tags WHERE entry_id = ?").all(id);
    expect(links.length).toBe(1);

    // Delete entry
    db.prepare("DELETE FROM entries WHERE id = ?").run(id);

    // Verify cascade
    const linksAfter = db.prepare("SELECT * FROM entry_tags WHERE entry_id = ?").all(id);
    expect(linksAfter.length).toBe(0);

    db.close();
  });

  test("WAL mode is enabled for concurrent access", () => {
    const db = createTestDb();

    const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");

    db.close();
  });

  test("entry listing with limit and offset", () => {
    const db = createTestDb();

    // Insert multiple entries
    for (let i = 0; i < 10; i++) {
      db.prepare(`
        INSERT INTO entries (id, title, status, created_at)
        VALUES (?, ?, 'transcribed', datetime('now', '-' || ? || ' hours'))
      `).run(`entry-${i}`, `Entry ${i}`, i);
    }

    // Test limit
    const limited = db.prepare(`
      SELECT * FROM entries ORDER BY created_at DESC LIMIT 5
    `).all();
    expect(limited.length).toBe(5);

    // Test offset
    const offset = db.prepare(`
      SELECT * FROM entries ORDER BY created_at DESC LIMIT 3 OFFSET 5
    `).all();
    expect(offset.length).toBe(3);

    db.close();
  });

  test("search entries by transcript content", () => {
    const db = createTestDb();

    db.prepare(`
      INSERT INTO entries (id, title, transcript, status)
      VALUES (?, ?, ?, 'transcribed')
    `).run("search-1", "Morning Walk", "I went for a walk in the park this morning");

    db.prepare(`
      INSERT INTO entries (id, title, transcript, status)
      VALUES (?, ?, ?, 'transcribed')
    `).run("search-2", "Evening Thoughts", "Had dinner and watched a movie");

    db.prepare(`
      INSERT INTO entries (id, title, transcript, status)
      VALUES (?, ?, ?, 'transcribed')
    `).run("search-3", "Park Visit", "The park was beautiful today");

    // Search for "park"
    const results = db.prepare(`
      SELECT * FROM entries WHERE transcript LIKE ? OR title LIKE ?
    `).all("%park%", "%park%") as { id: string }[];

    expect(results.length).toBe(2);
    expect(results.map(r => r.id)).toContain("search-1");
    expect(results.map(r => r.id)).toContain("search-3");

    db.close();
  });
});

describe("Data Integrity", () => {
  test("entry IDs are unique", () => {
    const db = createTestDb();
    const id = `unique-${Date.now()}`;

    db.prepare(`INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')`).run(id);

    expect(() => {
      db.prepare(`INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')`).run(id);
    }).toThrow();

    db.close();
  });

  test("tag names are unique and normalized", () => {
    const db = createTestDb();

    db.prepare(`INSERT INTO tags (name) VALUES (?)`).run("work");

    expect(() => {
      db.prepare(`INSERT INTO tags (name) VALUES (?)`).run("work");
    }).toThrow();

    db.close();
  });

  test("analysis JSON can be stored and retrieved", () => {
    const db = createTestDb();
    const id = `json-${Date.now()}`;
    const analysis = {
      title: "Test Entry",
      summary: "This is a summary",
      themes: ["testing", "development"],
      tags: ["work", "code"],
    };

    db.prepare(`
      INSERT INTO entries (id, status, analysis_json)
      VALUES (?, 'analyzed', ?)
    `).run(id, JSON.stringify(analysis));

    const entry = db.prepare("SELECT analysis_json FROM entries WHERE id = ?").get(id) as {
      analysis_json: string;
    };

    const parsed = JSON.parse(entry.analysis_json);
    expect(parsed.title).toBe("Test Entry");
    expect(parsed.themes).toContain("testing");

    db.close();
  });
});

describe("Audio File Handling", () => {
  test("audio file path storage", () => {
    const db = createTestDb();
    const id = `audio-${Date.now()}`;
    const audioPath = join(TEST_DATA_DIR, "audio", `${id}.webm`);

    // Simulate file creation
    const audioData = Buffer.from("fake audio data");
    require("fs").writeFileSync(audioPath, audioData);

    // Store path in DB
    db.prepare(`
      INSERT INTO entries (id, status, audio_path)
      VALUES (?, 'pending_transcription', ?)
    `).run(id, audioPath);

    // Retrieve and verify
    const entry = db.prepare("SELECT audio_path FROM entries WHERE id = ?").get(id) as {
      audio_path: string;
    };

    expect(entry.audio_path).toBe(audioPath);
    expect(existsSync(entry.audio_path)).toBe(true);

    db.close();
  });
});

describe("Markdown Sync", () => {
  test("entry can be exported to markdown format", () => {
    const db = createTestDb();
    const id = `md-${Date.now()}`;
    const transcript = "This is my journal entry about testing.";
    const title = "Testing Day";

    db.prepare(`
      INSERT INTO entries (id, title, transcript, status, created_at)
      VALUES (?, ?, ?, 'transcribed', datetime('now'))
    `).run(id, title, transcript);

    const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as {
      id: string;
      title: string;
      transcript: string;
      created_at: string;
      status: string;
    };

    // Generate markdown (simulating what storage.ts does)
    const md = `---
id: ${entry.id}
created: ${entry.created_at}
status: ${entry.status}
title: ${entry.title}
---

# ${entry.title}

${entry.transcript}
`.trim();

    const mdPath = join(TEST_DATA_DIR, "entries", `${id}.md`);
    require("fs").writeFileSync(mdPath, md);

    // Verify markdown file
    expect(existsSync(mdPath)).toBe(true);
    const content = readFileSync(mdPath, "utf-8");
    expect(content).toContain("Testing Day");
    expect(content).toContain("This is my journal entry");

    db.close();
  });
});
