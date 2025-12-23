import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { db, withTransaction, type Entry } from "../src/services/db.ts";
import { createEntry, deleteEntry, getEntry, updateEntry } from "../src/services/storage.ts";
import { mkdirSync, existsSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { config } from "../src/config.ts";

describe("withTransaction", () => {
  test("commits successful transactions", () => {
    const testId = `test-tx-commit-${Date.now()}`;

    withTransaction(() => {
      db.prepare("INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')").run(testId);
    });

    // Verify the entry was created
    const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(testId) as Entry | null;
    expect(entry).not.toBeNull();
    expect(entry?.id).toBe(testId);

    // Cleanup
    db.prepare("DELETE FROM entries WHERE id = ?").run(testId);
  });

  test("rolls back failed transactions", () => {
    const testId = `test-tx-rollback-${Date.now()}`;

    expect(() => {
      withTransaction(() => {
        db.prepare("INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')").run(testId);
        throw new Error("Simulated failure");
      });
    }).toThrow("Simulated failure");

    // Verify the entry was NOT created (rolled back)
    const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(testId) as Entry | null;
    expect(entry).toBeNull();
  });

  test("returns value from successful transaction", () => {
    const result = withTransaction(() => {
      return { answer: 42 };
    });

    expect(result).toEqual({ answer: 42 });
  });

  test("multiple operations in transaction are atomic", () => {
    const entryId = `test-atomic-${Date.now()}`;
    const tagName = `atomic-tag-${Date.now()}`;

    // Create entry first
    db.prepare("INSERT INTO entries (id, status) VALUES (?, 'pending_transcription')").run(entryId);

    expect(() => {
      withTransaction(() => {
        // Insert a tag
        db.prepare("INSERT INTO tags (name) VALUES (?)").run(tagName);
        const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName) as { id: number };
        // Link tag to entry
        db.prepare("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)").run(entryId, tag.id);
        // Force failure
        throw new Error("Rollback everything");
      });
    }).toThrow("Rollback everything");

    // Neither the tag nor the link should exist
    const tag = db.prepare("SELECT * FROM tags WHERE name = ?").get(tagName);
    expect(tag).toBeNull();

    // Cleanup
    db.prepare("DELETE FROM entries WHERE id = ?").run(entryId);
  });
});

describe("deleteEntry with transaction", () => {
  let testEntryId: string;
  let testAudioPath: string;
  let testMdPath: string;

  beforeEach(() => {
    // Create test directories
    mkdirSync(config.audioDir, { recursive: true });
    mkdirSync(config.entriesDir, { recursive: true });

    // Create a test entry with audio file
    const entry = createEntry();
    testEntryId = entry.id;
    testAudioPath = join(config.audioDir, `${testEntryId}.webm`);
    testMdPath = join(config.entriesDir, `${testEntryId}.md`);

    // Create fake audio file
    writeFileSync(testAudioPath, "fake audio data");

    // Update entry to have audio path (which triggers markdown sync)
    updateEntry(testEntryId, { audio_path: testAudioPath });
  });

  afterEach(() => {
    // Cleanup any leftover files
    if (existsSync(testAudioPath)) {
      rmSync(testAudioPath, { force: true });
    }
    if (existsSync(testMdPath)) {
      rmSync(testMdPath, { force: true });
    }
    // Cleanup DB entry if still exists
    db.prepare("DELETE FROM entries WHERE id = ?").run(testEntryId);
  });

  test("deletes entry from database first", () => {
    expect(getEntry(testEntryId)).not.toBeNull();
    expect(existsSync(testAudioPath)).toBe(true);

    const result = deleteEntry(testEntryId);

    expect(result).toBe(true);
    expect(getEntry(testEntryId)).toBeNull();
    // Files should be deleted after DB
    expect(existsSync(testAudioPath)).toBe(false);
  });

  test("returns false for non-existent entry", () => {
    const result = deleteEntry("non-existent-id");
    expect(result).toBe(false);
  });

  test("deletes markdown file", () => {
    expect(existsSync(testMdPath)).toBe(true);

    deleteEntry(testEntryId);

    expect(existsSync(testMdPath)).toBe(false);
  });

  test("succeeds even if files don't exist", () => {
    // Remove the files first
    rmSync(testAudioPath, { force: true });
    rmSync(testMdPath, { force: true });

    // Should still succeed for DB deletion
    const result = deleteEntry(testEntryId);
    expect(result).toBe(true);
    expect(getEntry(testEntryId)).toBeNull();
  });
});

describe("entry_tags index", () => {
  test("idx_entry_tags_tag_id index exists", () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry_tags'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain("idx_entry_tags_tag_id");
  });
});
