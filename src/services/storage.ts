import { db, type Entry, type EntryStatus, type Tag, withTransaction } from "./db.ts";
import { config } from "../config.ts";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

// Ensure directories exist
mkdirSync(config.audioDir, { recursive: true });
mkdirSync(config.entriesDir, { recursive: true });

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Entry CRUD
export function createEntry(audioPath?: string): Entry {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO entries (id, audio_path, status)
    VALUES (?, ?, 'pending_transcription')
    RETURNING *
  `);
  return stmt.get(id, audioPath || null) as Entry;
}

export function getEntry(id: string): Entry | null {
  const stmt = db.prepare("SELECT * FROM entries WHERE id = ?");
  return stmt.get(id) as Entry | null;
}

export function listEntries(options: {
  limit?: number;
  offset?: number;
  status?: EntryStatus;
} = {}): Entry[] {
  const { limit = 50, offset = 0, status } = options;

  if (status) {
    const stmt = db.prepare(`
      SELECT * FROM entries
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(status, limit, offset) as Entry[];
  }

  const stmt = db.prepare(`
    SELECT * FROM entries
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset) as Entry[];
}

export function updateEntry(id: string, updates: Partial<Pick<Entry,
  'title' | 'transcript' | 'audio_path' | 'audio_duration_seconds' |
  'status' | 'analysis_json' | 'follow_up_questions'
>>): Entry | null {
  const entry = getEntry(id);
  if (!entry) return null;

  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value as string | number | null);
  }

  values.push(id);
  const stmt = db.prepare(`
    UPDATE entries SET ${fields.join(", ")}
    WHERE id = ?
    RETURNING *
  `);

  const updated = stmt.get(...(values as (string | number | null)[])) as Entry;

  // Sync to markdown
  syncEntryToMarkdown(updated);

  return updated;
}

export function deleteEntry(id: string): boolean {
  const entry = getEntry(id);
  if (!entry) return false;

  // Store paths before deletion
  const audioPath = entry.audio_path;
  const mdPath = getMarkdownPath(id);

  // Delete from database FIRST (in transaction) - this is the critical operation
  // If this fails, we haven't deleted any files yet, so data is consistent
  withTransaction(() => {
    db.prepare("DELETE FROM entries WHERE id = ?").run(id);
  });

  // Now delete files - if these fail, we log but don't throw
  // Orphan files are harmless and can be cleaned up later
  if (audioPath && existsSync(audioPath)) {
    try {
      unlinkSync(audioPath);
    } catch (error) {
      console.error(`Failed to delete audio file ${audioPath}:`, error);
    }
  }

  if (existsSync(mdPath)) {
    try {
      unlinkSync(mdPath);
    } catch (error) {
      console.error(`Failed to delete markdown file ${mdPath}:`, error);
    }
  }

  return true;
}

// Tags
export function getOrCreateTag(name: string): Tag {
  const normalized = name.toLowerCase().trim();

  const existing = db.prepare("SELECT * FROM tags WHERE name = ?").get(normalized) as Tag | null;
  if (existing) return existing;

  const stmt = db.prepare("INSERT INTO tags (name) VALUES (?) RETURNING *");
  return stmt.get(normalized) as Tag;
}

export function addTagToEntry(entryId: string, tagName: string): void {
  const tag = getOrCreateTag(tagName);
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)
  `);
  stmt.run(entryId, tag.id);
}

export function removeTagFromEntry(entryId: string, tagName: string): void {
  const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName.toLowerCase().trim()) as { id: number } | null;
  if (!tag) return;

  db.prepare("DELETE FROM entry_tags WHERE entry_id = ? AND tag_id = ?").run(entryId, tag.id);
}

export function getEntryTags(entryId: string): Tag[] {
  const stmt = db.prepare(`
    SELECT t.* FROM tags t
    JOIN entry_tags et ON t.id = et.tag_id
    WHERE et.entry_id = ?
    ORDER BY t.name
  `);
  return stmt.all(entryId) as Tag[];
}

export function getAllTags(): Tag[] {
  return db.prepare("SELECT * FROM tags ORDER BY name").all() as Tag[];
}

// Entry links
export function linkEntries(sourceId: string, targetId: string, relationship?: string): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO entry_links (source_id, target_id, relationship)
    VALUES (?, ?, ?)
  `);
  stmt.run(sourceId, targetId, relationship || null);
}

export function getLinkedEntries(entryId: string): Array<Entry & { relationship: string | null }> {
  const stmt = db.prepare(`
    SELECT e.*, el.relationship FROM entries e
    JOIN entry_links el ON e.id = el.target_id
    WHERE el.source_id = ?
    UNION
    SELECT e.*, el.relationship FROM entries e
    JOIN entry_links el ON e.id = el.source_id
    WHERE el.target_id = ?
  `);
  return stmt.all(entryId, entryId) as Array<Entry & { relationship: string | null }>;
}

// Markdown sync
function getMarkdownPath(entryId: string): string {
  return join(config.entriesDir, `${entryId}.md`);
}

export function syncEntryToMarkdown(entry: Entry): void {
  const tags = getEntryTags(entry.id);
  const tagStr = tags.length > 0 ? tags.map(t => t.name).join(", ") : "";

  let analysis = null;
  if (entry.analysis_json) {
    try {
      analysis = JSON.parse(entry.analysis_json);
    } catch {}
  }

  let followUps: string[] = [];
  if (entry.follow_up_questions) {
    try {
      followUps = JSON.parse(entry.follow_up_questions);
    } catch {}
  }

  const content = `---
id: ${entry.id}
created: ${entry.created_at}
updated: ${entry.updated_at}
status: ${entry.status}
${entry.title ? `title: ${entry.title}` : ""}
${tagStr ? `tags: [${tagStr}]` : ""}
${entry.audio_path ? `audio: ${entry.audio_path}` : ""}
${entry.audio_duration_seconds ? `duration: ${entry.audio_duration_seconds}s` : ""}
---

${entry.title ? `# ${entry.title}\n\n` : ""}${entry.transcript || "*No transcript yet*"}

${analysis ? `\n## Analysis\n\n${JSON.stringify(analysis, null, 2)}` : ""}

${followUps.length > 0 ? `\n## Follow-up Questions\n\n${followUps.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}
`.trim() + "\n";

  try {
    writeFileSync(getMarkdownPath(entry.id), content);
  } catch (error) {
    // Log error but don't throw - markdown sync failure shouldn't break the app
    // The DB is the source of truth; markdown files are convenience exports
    console.error(`Failed to sync entry ${entry.id} to markdown:`, error);
  }
}

// Audio file handling
export function saveAudioFile(id: string, data: Buffer, extension: string): string {
  const filename = `${id}.${extension}`;
  const filepath = join(config.audioDir, filename);
  try {
    writeFileSync(filepath, data);
  } catch (error) {
    // Audio file save is critical - rethrow with context
    throw new Error(`Failed to save audio file to ${filepath}: ${error}`);
  }
  return filepath;
}

export function getAudioFilePath(id: string): string | null {
  const entry = getEntry(id);
  return entry?.audio_path || null;
}

// Search (basic - for more sophisticated search, we'd add FTS5)
export function searchEntries(query: string, limit = 20): Entry[] {
  const stmt = db.prepare(`
    SELECT * FROM entries
    WHERE transcript LIKE ? OR title LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const pattern = `%${query}%`;
  return stmt.all(pattern, pattern, limit) as Entry[];
}
