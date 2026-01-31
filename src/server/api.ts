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
  getCache,
  setCache,
  getHeadAnalyzedEntry,
  getAgentOverview,
  setAgentOverview,
  getUserProfile,
  setUserProfile,
} from "../services/storage.ts";
import { withTransaction } from "../services/db.ts";
import { getSTTProvider } from "../services/stt.ts";
import { analyzeTranscript, findRelatedEntries, generateInterviewQuestions } from "../services/analysis.ts";
import { config } from "../config.ts";
import { existsSync } from "fs";
import { rateLimit, aiRateLimit } from "./rate-limit.ts";

// Validation: Entry IDs must be alphanumeric with hyphens only (matches generateId pattern)
const ENTRY_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function isValidEntryId(id: string): boolean {
  return ENTRY_ID_PATTERN.test(id) && id.length > 0 && id.length <= 100;
}

// File upload constraints
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "video/webm", // Chrome MediaRecorder uses video/webm container for audio
  "audio/ogg",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4", // For iOS Safari compatibility
  "audio/x-m4a",
] as const;

function isAllowedAudioMimeType(mimeType: string): boolean {
  return ALLOWED_AUDIO_MIME_TYPES.some(allowed => mimeType.startsWith(allowed));
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "webm"; // fallback
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

// Apply general rate limiting to all API routes
api.use("*", rateLimit);

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

    // Validate MIME type
    if (!isAllowedAudioMimeType(audioFile.type)) {
      return c.json({ error: "Invalid audio format. Allowed: webm, ogg, mp3, mp4, m4a" }, 400);
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: "File too large. Maximum size is 50MB" }, 413);
    }

    const entry = createEntry();
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    const ext = getExtensionFromMimeType(audioFile.type);
    const audioPath = saveAudioFile(entry.id, buffer, ext);
    const updated = updateEntry(entry.id, { audio_path: audioPath });

    return c.json({ ...updated, tags: [] }, 201);
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

  const finalEntry = getEntry(entry.id);
  return c.json({ ...finalEntry, tags: [] }, 201);
});

// Upload audio chunk (for chunked uploads)
// Track accumulated chunk sizes per entry to enforce total size limit
const chunkAccumulator = new Map<string, number>();

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

  // Validate MIME type
  if (!isAllowedAudioMimeType(chunk.type)) {
    return c.json({ error: "Invalid audio format. Allowed: webm, ogg, mp3, mp4, m4a" }, 400);
  }

  // Track accumulated size for this entry
  const currentSize = chunkAccumulator.get(id) || 0;
  const newSize = currentSize + chunk.size;

  if (newSize > MAX_FILE_SIZE_BYTES) {
    chunkAccumulator.delete(id); // Reset on error
    return c.json({ error: "Total file size exceeds 50MB limit" }, 413);
  }

  const buffer = Buffer.from(await chunk.arrayBuffer());
  const ext = getExtensionFromMimeType(chunk.type);
  const { appendFileSync, writeFileSync } = await import("fs");
  const { join } = await import("path");

  const audioPath = join(config.audioDir, `${id}.${ext}`);

  if (chunkIndex === "0") {
    writeFileSync(audioPath, buffer);
    chunkAccumulator.set(id, chunk.size);
  } else {
    appendFileSync(audioPath, buffer);
    chunkAccumulator.set(id, newSize);
  }

  if (isLast) {
    chunkAccumulator.delete(id); // Cleanup
    updateEntry(id, { audio_path: audioPath });
  }

  return c.json({ success: true, isLast });
});

// Trigger transcription (with stricter rate limiting for expensive STT calls)
api.post("/entries/:id/transcribe", aiRateLimit, async (c) => {
  const id = c.req.param("id");
  const entry = getEntry(id);

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (!entry.audio_path) {
    return c.json({ error: "No audio file for this entry" }, 400);
  }

  // Optional transcription prompt (Whisper initial_prompt)
  const body = await c.req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt : undefined;

  try {
    const { readFileSync } = await import("fs");
    const audioData = readFileSync(entry.audio_path);

    const mimeType = entry.audio_path.endsWith(".webm") ? "audio/webm"
      : entry.audio_path.endsWith(".ogg") ? "audio/ogg"
      : entry.audio_path.endsWith(".mp3") ? "audio/mp3"
      : "audio/webm";

    const stt = getSTTProvider();
    const startTime = Date.now();
    const result = await stt.transcribe(audioData, mimeType, prompt);
    const transcribeSeconds = (Date.now() - startTime) / 1000;

    // Log timing metrics
    const audioSeconds = result.duration || 0;
    const speedRatio = audioSeconds > 0 ? (audioSeconds / transcribeSeconds).toFixed(2) : "N/A";
    console.log(`[Transcribe] entry=${id} audio=${audioSeconds.toFixed(1)}s transcribe=${transcribeSeconds.toFixed(1)}s ratio=${speedRatio}x`);

    const updated = updateEntry(id, {
      transcript: result.text,
      audio_duration_seconds: result.duration,
      status: "transcribed",
    });

    // Include tags (likely empty at this stage, but keeps API consistent)
    const tags = getEntryTags(id);
    return c.json({ ...updated, tags: tags.map(t => t.name) });
  } catch (error) {
    console.error("Transcription error:", error);
    // Log full error server-side, return generic message to client
    return c.json({ error: "Transcription failed" }, 500);
  }
});

// Re-transcribe entry (clears existing transcript + analysis, re-transcribes from audio)
api.post("/entries/:id/retranscribe", aiRateLimit, async (c) => {
  const id = c.req.param("id");
  const entry = getEntry(id);

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (!entry.audio_path) {
    return c.json({ error: "No audio file for this entry" }, 400);
  }

  // Optional transcription prompt (Whisper initial_prompt)
  const body = await c.req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt : undefined;

  try {
    // Clear existing tags first
    const existingTags = getEntryTags(id);
    for (const tag of existingTags) {
      removeTagFromEntry(id, tag.name);
    }

    // Clear transcript and analysis
    updateEntry(id, {
      title: null,
      transcript: null,
      analysis_json: null,
      follow_up_questions: null,
      agent_trajectory: null,
      status: "pending_transcription",
    });

    // Re-transcribe
    const { readFileSync } = await import("fs");
    const audioData = readFileSync(entry.audio_path);

    const mimeType = entry.audio_path.endsWith(".webm") ? "audio/webm"
      : entry.audio_path.endsWith(".ogg") ? "audio/ogg"
      : entry.audio_path.endsWith(".mp3") ? "audio/mp3"
      : "audio/webm";

    const stt = getSTTProvider();
    const startTime = Date.now();
    const result = await stt.transcribe(audioData, mimeType, prompt);
    const transcribeSeconds = (Date.now() - startTime) / 1000;

    // Log timing metrics
    const audioSeconds = result.duration || 0;
    const speedRatio = audioSeconds > 0 ? (audioSeconds / transcribeSeconds).toFixed(2) : "N/A";
    console.log(`[Re-transcribe] entry=${id} audio=${audioSeconds.toFixed(1)}s transcribe=${transcribeSeconds.toFixed(1)}s ratio=${speedRatio}x`);

    const updated = updateEntry(id, {
      transcript: result.text,
      audio_duration_seconds: result.duration,
      status: "transcribed",
    });

    return c.json({ ...updated, tags: [] });
  } catch (error) {
    console.error("Re-transcription error:", error);
    return c.json({ error: "Re-transcription failed" }, 500);
  }
});

// Trigger analysis (with stricter rate limiting for expensive Claude calls)
api.post("/entries/:id/analyze", aiRateLimit, async (c) => {
  const id = c.req.param("id");
  const requestStartTime = Date.now();
  console.log(`[Analyze:${id}] === Starting analysis request ===`);

  const entry = getEntry(id);
  console.log(`[Analyze:${id}] Entry lookup: ${entry ? "found" : "not found"}`);

  if (!entry) {
    console.log(`[Analyze:${id}] Returning 404 - entry not found`);
    return c.json({ error: "Entry not found" }, 404);
  }

  console.log(`[Analyze:${id}] Entry details: status=${entry.status}, hasTranscript=${!!entry.transcript}, transcriptLength=${entry.transcript?.length || 0}`);

  if (!entry.transcript) {
    console.log(`[Analyze:${id}] Returning 400 - no transcript`);
    return c.json({ error: "No transcript to analyze" }, 400);
  }

  try {
    console.log(`[Analyze:${id}] Fetching existing tags...`);
    const existingTags = getAllTags();
    console.log(`[Analyze:${id}] Found ${existingTags.length} existing tags: ${existingTags.map(t => t.name).join(", ")}`);

    // External API calls happen outside the transaction (they're slow and don't touch DB)
    console.log(`[Analyze:${id}] Starting analyzeTranscript...`);
    const analysisStartTime = Date.now();
    const { analysis, trajectory } = await analyzeTranscript(id, entry.transcript, existingTags);
    const analyzeSeconds = (Date.now() - analysisStartTime) / 1000;
    console.log(`[Analyze:${id}] analyzeTranscript completed in ${analyzeSeconds.toFixed(1)}s`);

    // Log timing metrics
    const wordCount = entry.transcript.split(/\s+/).length;
    const wordsPerSecond = (wordCount / analyzeSeconds).toFixed(1);
    console.log(`[Analyze:${id}] Metrics: words=${wordCount} rate=${wordsPerSecond}w/s turns=${trajectory.numTurns} cost=$${trajectory.totalCostUsd.toFixed(4)}`);

    // Log analysis result summary
    console.log(`[Analyze:${id}] Analysis result: title="${analysis.title}", themes=${analysis.themes.length}, tags=${analysis.tags.length}, insights=${analysis.key_insights.length}`);
    console.log(`[Analyze:${id}] Analysis tags: ${analysis.tags.join(", ")}`);
    console.log(`[Analyze:${id}] Analysis themes: ${analysis.themes.join(", ")}`);

    console.log(`[Analyze:${id}] Finding related entries...`);
    const relatedStartTime = Date.now();
    const related = await findRelatedEntries(entry, analysis);
    console.log(`[Analyze:${id}] findRelatedEntries completed in ${((Date.now() - relatedStartTime) / 1000).toFixed(2)}s, found ${related.length} related entries`);
    if (related.length > 0) {
      console.log(`[Analyze:${id}] Related entries: ${related.map(r => `${r.entry.id} (${r.reason.slice(0, 50)}...)`).join(", ")}`);
    }

    // Wrap all DB operations in a transaction for atomicity
    // If any operation fails, the entire analysis update is rolled back
    console.log(`[Analyze:${id}] Starting database transaction...`);
    const transactionStartTime = Date.now();
    const updated = withTransaction(() => {
      // Apply tags
      console.log(`[Analyze:${id}] Applying ${analysis.tags.length} tags...`);
      for (const tagName of analysis.tags) {
        console.log(`[Analyze:${id}]   Adding tag: "${tagName}"`);
        addTagToEntry(id, tagName);
      }
      console.log(`[Analyze:${id}] Tags applied successfully`);

      // Create links to related entries
      console.log(`[Analyze:${id}] Creating ${related.length} entry links...`);
      for (const { entry: relatedEntry, reason } of related) {
        console.log(`[Analyze:${id}]   Linking to: ${relatedEntry.id}`);
        linkEntries(id, relatedEntry.id, reason);
      }
      console.log(`[Analyze:${id}] Entry links created successfully`);

      // Update entry with analysis data including trajectory
      console.log(`[Analyze:${id}] Updating entry with analysis data...`);
      const analysisJson = JSON.stringify(analysis);
      const followUpJson = JSON.stringify(analysis.follow_up_questions);
      const trajectoryJson = JSON.stringify(trajectory);
      console.log(`[Analyze:${id}] JSON sizes: analysis=${analysisJson.length}, followUp=${followUpJson.length}, trajectory=${trajectoryJson.length}`);

      const result = updateEntry(id, {
        title: analysis.title,
        analysis_json: analysisJson,
        follow_up_questions: followUpJson,
        agent_trajectory: trajectoryJson,
        status: "analyzed",
      });
      console.log(`[Analyze:${id}] Entry updated: ${result ? "success" : "failed/null"}`);
      return result;
    });
    const transactionMs = Date.now() - transactionStartTime;
    console.log(`[Analyze:${id}] Transaction completed in ${transactionMs}ms`);

    if (!updated) {
      console.error(`[Analyze:${id}] Transaction returned null/undefined - entry update failed`);
      throw new Error("Entry update returned null");
    }

    // Get tags for the response
    console.log(`[Analyze:${id}] Fetching tags for response...`);
    const tags = getEntryTags(id);
    console.log(`[Analyze:${id}] Entry now has ${tags.length} tags: ${tags.map(t => t.name).join(", ")}`);

    const totalMs = Date.now() - requestStartTime;
    console.log(`[Analyze:${id}] === Analysis complete, returning success (${totalMs}ms total) ===`);

    return c.json({
      ...updated,
      tags: tags.map(t => t.name),
      analysis,
      related_entries: related.map(r => ({
        id: r.entry.id,
        title: r.entry.title,
        reason: r.reason,
      })),
    });
  } catch (error) {
    const totalMs = Date.now() - requestStartTime;
    console.error(`[Analyze:${id}] === Analysis FAILED after ${totalMs}ms ===`);
    console.error(`[Analyze:${id}] Error type: ${error?.constructor?.name || typeof error}`);
    console.error(`[Analyze:${id}] Error message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`[Analyze:${id}] Stack trace:\n${error.stack}`);
    }
    if (error && typeof error === "object") {
      // Log any additional properties on the error object
      const errorProps = Object.keys(error).filter(k => k !== "message" && k !== "stack");
      if (errorProps.length > 0) {
        console.error(`[Analyze:${id}] Additional error properties: ${JSON.stringify(error, errorProps, 2)}`);
      }
    }
    // Log full error server-side, return generic message to client
    return c.json({ error: "Analysis failed" }, 500);
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

// Interview questions (cached based on HEAD analyzed entry)
api.get("/interview-questions", async (c) => {
  const headEntry = getHeadAnalyzedEntry();
  const headEntryId = headEntry?.id || null;

  // Check cache - only valid if HEAD entry hasn't changed
  const cached = getCache<string[]>("interview_questions", headEntryId || undefined);
  if (cached) {
    return c.json({ questions: cached });
  }

  // Generate new questions
  const recentEntries = listEntries({ limit: 10, status: "analyzed" });
  const questions = await generateInterviewQuestions(recentEntries);

  // Cache with dependency on HEAD entry
  if (headEntryId) {
    setCache("interview_questions", questions, headEntryId);
  }

  return c.json({ questions });
});

// Settings - Agent Overview
api.get("/settings/agent-overview", async (c) => {
  const overview = getAgentOverview();
  return c.json({ overview: overview || "" });
});

api.put("/settings/agent-overview", async (c) => {
  const body = await c.req.json();
  const overview = body.overview;

  if (typeof overview !== "string") {
    return c.json({ error: "Overview must be a string" }, 400);
  }

  setAgentOverview(overview);
  return c.json({ success: true });
});

// Settings - User Profile (agent-editable document about the user)
api.get("/settings/user-profile", async (c) => {
  const profile = getUserProfile();
  return c.json({ profile: profile || "" });
});

api.put("/settings/user-profile", async (c) => {
  const body = await c.req.json();
  const profile = body.profile;

  if (typeof profile !== "string") {
    return c.json({ error: "Profile must be a string" }, 400);
  }

  setUserProfile(profile);
  return c.json({ success: true });
});

export { api };
