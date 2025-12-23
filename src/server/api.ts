import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import {
  createEntry,
  getEntry,
  listEntries,
  updateEntry,
  deleteEntry,
  saveAudioFile,
  getEntryTags,
  addTagToEntry,
  removeTagFromEntry,
  getAllTags,
  linkEntries,
  getLinkedEntries,
  searchEntries,
} from "../services/storage.ts";
import { withTransaction } from "../services/db.ts";
import { getSTTProvider } from "../services/stt.ts";
import { analyzeTranscript, findRelatedEntries, generateInterviewQuestions } from "../services/analysis.ts";
import { config } from "../config.ts";
import { existsSync } from "fs";

// Validation: Entry IDs must be alphanumeric with hyphens only (matches generateId pattern)
const ENTRY_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function isValidEntryId(id: string): boolean {
  return ENTRY_ID_PATTERN.test(id) && id.length > 0 && id.length <= 100;
}

// Zod schema for PATCH /entries/:id - only allow valid entry fields
const UpdateEntrySchema = z.object({
  title: z.string().optional(),
  transcript: z.string().optional(),
  audio_path: z.string().optional(),
  audio_duration_seconds: z.number().optional(),
  status: z.enum(["pending_transcription", "transcribed", "analyzed"]).optional(),
  analysis_json: z.string().optional(),
  follow_up_questions: z.string().optional(),
}).strict(); // Reject unknown keys

const api = new Hono();

// List entries
api.get("/entries", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const status = c.req.query("status") as "pending_transcription" | "transcribed" | "analyzed" | undefined;

  const entries = listEntries({ limit, offset, status });

  // Include tags for each entry
  const entriesWithTags = entries.map(entry => ({
    ...entry,
    tags: getEntryTags(entry.id).map(t => t.name),
  }));

  return c.json({ entries: entriesWithTags });
});

// Get single entry
api.get("/entries/:id", async (c) => {
  const id = c.req.param("id");
  const entry = getEntry(id);

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  const tags = getEntryTags(id);
  const links = getLinkedEntries(id);

  return c.json({
    ...entry,
    tags: tags.map(t => t.name),
    linked_entries: links.map(l => ({
      id: l.id,
      title: l.title,
      relationship: l.relationship,
    })),
  });
});

// Create new entry with audio upload
api.post("/entries", async (c) => {
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    // Handle audio upload
    const formData = await c.req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return c.json({ error: "No audio file provided" }, 400);
    }

    const entry = createEntry();
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // Determine extension from mime type
    const ext = audioFile.type.includes("webm") ? "webm"
      : audioFile.type.includes("ogg") ? "ogg"
      : audioFile.type.includes("mp3") ? "mp3"
      : "webm";

    const audioPath = saveAudioFile(entry.id, buffer, ext);
    const updated = updateEntry(entry.id, { audio_path: audioPath });

    return c.json(updated, 201);
  }

  // Handle JSON body (for creating text-only entries)
  const body = await c.req.json().catch(() => ({}));
  const entry = createEntry();

  if (body.transcript) {
    updateEntry(entry.id, {
      transcript: body.transcript,
      status: "transcribed",
    });
  }

  return c.json(getEntry(entry.id), 201);
});

// Upload audio chunk (for chunked uploads)
api.post("/entries/:id/audio-chunk", async (c) => {
  const id = c.req.param("id");

  // Validate entry ID to prevent path traversal
  if (!isValidEntryId(id)) {
    return c.json({ error: "Invalid entry ID" }, 400);
  }

  const entry = getEntry(id);

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  const formData = await c.req.formData();
  const chunk = formData.get("chunk") as File | null;
  const chunkIndex = formData.get("index") as string | null;
  const isLast = formData.get("isLast") === "true";

  if (!chunk) {
    return c.json({ error: "No chunk provided" }, 400);
  }

  // For simplicity, we'll handle this by accumulating chunks
  // In production, you might want to use a more sophisticated approach
  const buffer = Buffer.from(await chunk.arrayBuffer());

  // Append to existing file or create new
  const ext = chunk.type.includes("webm") ? "webm" : "ogg";
  const { appendFileSync, writeFileSync } = await import("fs");
  const { join } = await import("path");

  const audioPath = join(config.audioDir, `${id}.${ext}`);

  if (chunkIndex === "0") {
    writeFileSync(audioPath, buffer);
  } else {
    appendFileSync(audioPath, buffer);
  }

  if (isLast) {
    updateEntry(id, { audio_path: audioPath });
  }

  return c.json({ success: true, isLast });
});

// Trigger transcription
api.post("/entries/:id/transcribe", async (c) => {
  const id = c.req.param("id");
  const entry = getEntry(id);

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (!entry.audio_path) {
    return c.json({ error: "No audio file for this entry" }, 400);
  }

  try {
    const { readFileSync } = await import("fs");
    const audioData = readFileSync(entry.audio_path);

    const mimeType = entry.audio_path.endsWith(".webm") ? "audio/webm"
      : entry.audio_path.endsWith(".ogg") ? "audio/ogg"
      : entry.audio_path.endsWith(".mp3") ? "audio/mp3"
      : "audio/webm";

    const stt = getSTTProvider();
    const result = await stt.transcribe(audioData, mimeType);

    const updated = updateEntry(id, {
      transcript: result.text,
      audio_duration_seconds: result.duration,
      status: "transcribed",
    });

    return c.json(updated);
  } catch (error) {
    console.error("Transcription error:", error);
    return c.json({ error: "Transcription failed", details: String(error) }, 500);
  }
});

// Trigger analysis
api.post("/entries/:id/analyze", async (c) => {
  const id = c.req.param("id");
  const entry = getEntry(id);

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (!entry.transcript) {
    return c.json({ error: "No transcript to analyze" }, 400);
  }

  try {
    const existingTags = getAllTags();

    // External API calls happen outside the transaction (they're slow and don't touch DB)
    const analysis = await analyzeTranscript(entry.transcript, existingTags);
    const related = await findRelatedEntries(entry, analysis);

    // Wrap all DB operations in a transaction for atomicity
    // If any operation fails, the entire analysis update is rolled back
    const updated = withTransaction(() => {
      // Apply tags
      for (const tagName of analysis.tags) {
        addTagToEntry(id, tagName);
      }

      // Create links to related entries
      for (const { entry: relatedEntry, reason } of related) {
        linkEntries(id, relatedEntry.id, reason);
      }

      // Update entry with analysis data
      return updateEntry(id, {
        title: analysis.title,
        analysis_json: JSON.stringify(analysis),
        follow_up_questions: JSON.stringify(analysis.follow_up_questions),
        status: "analyzed",
      });
    });

    return c.json({
      ...updated,
      analysis,
      related_entries: related.map(r => ({
        id: r.entry.id,
        title: r.entry.title,
        reason: r.reason,
      })),
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return c.json({ error: "Analysis failed", details: String(error) }, 500);
  }
});

// Update entry
api.patch("/entries/:id", async (c) => {
  const id = c.req.param("id");

  // Validate request body with Zod schema
  const body = await c.req.json();
  const parsed = UpdateEntrySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      error: "Invalid request body",
      details: parsed.error.issues
    }, 400);
  }

  const entry = updateEntry(id, parsed.data);
  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  return c.json(entry);
});

// Delete entry
api.delete("/entries/:id", async (c) => {
  const id = c.req.param("id");

  if (!deleteEntry(id)) {
    return c.json({ error: "Entry not found" }, 404);
  }

  return c.json({ success: true });
});

// Stream audio
api.get("/entries/:id/audio", async (c) => {
  const id = c.req.param("id");
  const entry = getEntry(id);

  if (!entry || !entry.audio_path) {
    return c.json({ error: "Audio not found" }, 404);
  }

  if (!existsSync(entry.audio_path)) {
    return c.json({ error: "Audio file missing" }, 404);
  }

  const { readFileSync, statSync } = await import("fs");
  const stat = statSync(entry.audio_path);
  const audioData = readFileSync(entry.audio_path);

  const mimeType = entry.audio_path.endsWith(".webm") ? "audio/webm"
    : entry.audio_path.endsWith(".ogg") ? "audio/ogg"
    : entry.audio_path.endsWith(".mp3") ? "audio/mp3"
    : "audio/webm";

  return new Response(audioData, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": stat.size.toString(),
      "Accept-Ranges": "bytes",
    },
  });
});

// Tags
api.get("/tags", async (c) => {
  const tags = getAllTags();
  return c.json({ tags });
});

api.post("/entries/:id/tags", async (c) => {
  const id = c.req.param("id");
  const { tag } = await c.req.json();

  if (!tag) {
    return c.json({ error: "Tag name required" }, 400);
  }

  addTagToEntry(id, tag);
  return c.json({ success: true });
});

api.delete("/entries/:id/tags/:tag", async (c) => {
  const id = c.req.param("id");
  const tag = c.req.param("tag");

  removeTagFromEntry(id, tag);
  return c.json({ success: true });
});

// Search
api.get("/search", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json({ error: "Query required" }, 400);
  }

  const entries = searchEntries(query);
  return c.json({ entries });
});

// Interview questions
api.get("/interview-questions", async (c) => {
  const recentEntries = listEntries({ limit: 10, status: "analyzed" });
  const questions = await generateInterviewQuestions(recentEntries);
  return c.json({ questions });
});

export { api };
