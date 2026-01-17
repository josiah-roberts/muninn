import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { transcribeAudio } from "./whisper.ts";

const app = new Hono();

// Configuration
const PORT = parseInt(process.env.PORT || "3001");
const WHISPER_URL = process.env.WHISPER_URL || "http://localhost:9000";

// Serve static files (frontend)
app.use("/*", serveStatic({ root: "./src/public" }));

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "ok", whisperUrl: WHISPER_URL });
});

// Transcription endpoint
app.post("/api/transcribe", async (c) => {
  try {
    const body = await c.req.parseBody();
    const audioFile = body.audio;

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json({ error: "No audio file provided" }, 400);
    }

    // Get file data as ArrayBuffer, then convert to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`Transcribing ${audioFile.name} (${audioFile.type}, ${buffer.length} bytes)`);

    // Transcribe using Whisper
    const result = await transcribeAudio(buffer, audioFile.type, WHISPER_URL);

    console.log(`Transcription complete: ${result.text.length} characters`);

    return c.json({
      text: result.text,
      language: result.language,
      duration: result.duration,
      fileName: audioFile.name,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Transcription failed",
      },
      500
    );
  }
});

// Start server
console.log(`🎤 Whisper Transcription Service starting on port ${PORT}`);
console.log(`📡 Whisper URL: ${WHISPER_URL}`);

export default {
  port: PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
