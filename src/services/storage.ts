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
  'status' | 'analysis_json' | 'follow_up_questions' | 'agent_trajectory'
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
  const mdPath = getMarkdownPath(entry);
  const idBasedMdPath = getIdBasedMarkdownPath(id);

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

  // Delete the current markdown file (title-based or id-based)
  if (existsSync(mdPath)) {
    try {
      unlinkSync(mdPath);
    } catch (error) {
      console.error(`Failed to delete markdown file ${mdPath}:`, error);
    }
  }

  // Also try to delete ID-based file in case it exists (for entries that were renamed)
  if (mdPath !== idBasedMdPath && existsSync(idBasedMdPath)) {
    try {
      unlinkSync(idBasedMdPath);
    } catch (error) {
      console.error(`Failed to delete old markdown file ${idBasedMdPath}:`, error);
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

// Settings CRUD
export function getSetting(key: string): string | null {
  const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
  const result = stmt.get(key) as { value: string } | null;
  return result?.value || null;
}

export function setSetting(key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(key, value);
}

export function getAgentOverview(): string | null {
  return getSetting("agent_overview");
}

export function setAgentOverview(overview: string): void {
  setSetting("agent_overview", overview);
}

// Sanitize a string for use as a filename
function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars except spaces and hyphens
    .replace(/\s+/g, "-")         // Replace spaces with hyphens
    .replace(/-+/g, "-")          // Collapse multiple hyphens
    .replace(/^-|-$/g, "")        // Trim leading/trailing hyphens
    .slice(0, 100);               // Limit length
}

// Markdown sync
function getMarkdownPath(entry: Entry): string {
  // Use title-based filename if entry has been analyzed and has a title
  if (entry.status === "analyzed" && entry.title) {
    const sanitized = sanitizeFilename(entry.title);
    if (sanitized) {
      // Format: sanitized-title--id.md (id suffix ensures uniqueness)
      return join(config.entriesDir, `${sanitized}--${entry.id}.md`);
    }
  }
  // Fallback to ID-based filename
  return join(config.entriesDir, `${entry.id}.md`);
}

// Get the old (ID-based) markdown path for cleanup
function getIdBasedMarkdownPath(entryId: string): string {
  return join(config.entriesDir, `${entryId}.md`);
}

export function syncEntryToMarkdown(entry: Entry): void {
  const tags = getEntryTags(entry.id);
  const tagStr = tags.length > 0 ? tags.map(t => t.name).join(", ") : "";

  let analysis = null;
  if (entry.analysis_json) {
    try {
      analysis = JSON.parse(entry.analysis_json);
    } catch (err) {
      console.error(`Failed to parse analysis_json for entry ${entry.id}:`, err);
    }
  }

  let followUps: string[] = [];
  if (entry.follow_up_questions) {
    try {
      followUps = JSON.parse(entry.follow_up_questions);
    } catch (err) {
      console.error(`Failed to parse follow_up_questions for entry ${entry.id}:`, err);
    }
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

  const newPath = getMarkdownPath(entry);
  const oldIdPath = getIdBasedMarkdownPath(entry.id);

  try {
    // If we're now using a title-based path, clean up the old ID-based file
    if (newPath !== oldIdPath && existsSync(oldIdPath)) {
      try {
        unlinkSync(oldIdPath);
      } catch (err) {
        console.warn(`Failed to clean up old markdown file ${oldIdPath}:`, err);
      }
    }

    writeFileSync(newPath, content);
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

  // Fix WebM metadata for proper seeking (async, non-blocking)
  if (extension === "webm") {
    fixWebmMetadata(filepath).catch(err => {
      console.warn(`Failed to fix WebM metadata for ${filepath}:`, err);
    });
  }

  return filepath;
}

/**
 * Remux WebM file to fix duration metadata for proper seeking.
 * MediaRecorder creates WebM files without proper duration info.
 */
async function fixWebmMetadata(filepath: string): Promise<void> {
  const { spawn } = await import("child_process");
  const tempPath = filepath + ".tmp";

  return new Promise((resolve, reject) => {
    // Remux the file (copy streams) to fix metadata
    const ffmpeg = spawn("ffmpeg", [
      "-y",           // Overwrite output
      "-i", filepath, // Input file
      "-c", "copy",   // Copy streams without re-encoding
      tempPath,       // Output to temp file
    ], { stdio: "pipe" });

    ffmpeg.on("close", async (code) => {
      if (code === 0) {
        try {
          // Replace original with fixed version
          const { renameSync } = await import("fs");
          renameSync(tempPath, filepath);
          resolve();
        } catch (err) {
          reject(err);
        }
      } else {
        // Clean up temp file on failure
        try {
          const { unlinkSync } = await import("fs");
          unlinkSync(tempPath);
        } catch { /* ignore */ }
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);
  });
}

export function getAudioFilePath(id: string): string | null {
  const entry = getEntry(id);
  return entry?.audio_path || null;
}

// Escape LIKE wildcards in user input to prevent unintended pattern matching
function escapeLikePattern(query: string): string {
  return query
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/%/g, "\\%")   // Escape percent signs
    .replace(/_/g, "\\_");  // Escape underscores
}

// Search (basic - for more sophisticated search, we'd add FTS5)
export function searchEntries(query: string, limit = 20): Entry[] {
  const stmt = db.prepare(`
    SELECT * FROM entries
    WHERE transcript LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const pattern = `%${escapeLikePattern(query)}%`;
  return stmt.all(pattern, pattern, limit) as Entry[];
}

// Cache helpers
interface CacheEntry {
  key: string;
  value: string;
  depends_on: string | null;
  created_at: string;
}

export function getCache<T>(key: string, dependsOn?: string): T | null {
  const stmt = db.prepare("SELECT * FROM cache WHERE key = ?");
  const cached = stmt.get(key) as CacheEntry | null;

  if (!cached) return null;

  // If dependsOn is provided, check if it matches
  if (dependsOn !== undefined && cached.depends_on !== dependsOn) {
    return null; // Cache invalidated due to dependency change
  }

  try {
    return JSON.parse(cached.value) as T;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, value: T, dependsOn?: string): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cache (key, value, depends_on, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  stmt.run(key, JSON.stringify(value), dependsOn || null);
}

export function invalidateCache(key: string): void {
  db.prepare("DELETE FROM cache WHERE key = ?").run(key);
}

// Get the most recent analyzed entry (HEAD)
export function getHeadAnalyzedEntry(): Entry | null {
  const stmt = db.prepare(`
    SELECT * FROM entries
    WHERE status = 'analyzed'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get() as Entry | null;
}
