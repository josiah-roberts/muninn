/**
 * Whisper transcription service
 */

const STT_TIMEOUT_MS = 180_000; // 3 minutes for longer recordings

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

interface WhisperWord {
  start: number;
  end: number;
  word: string;
  probability: number;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

interface WhisperResponse {
  text: string;
  language?: string;
  segments?: WhisperSegment[];
}

/**
 * Process word timestamps to insert pause markers for gaps > 2 seconds
 */
function insertPauseMarkers(segments: WhisperSegment[]): string {
  const allWords: WhisperWord[] = [];

  for (const segment of segments) {
    if (segment.words) {
      allWords.push(...segment.words);
    }
  }

  if (allWords.length === 0) {
    return segments.map(s => s.text).join(" ").trim();
  }

  const parts: string[] = [];
  let lastEndTime = 0;

  for (const word of allWords) {
    const gap = word.start - lastEndTime;

    if (gap >= 2 && parts.length > 0) {
      const pauseSeconds = Math.round(gap);
      parts.push(` [${pauseSeconds}s]`);
    }

    parts.push(word.word);
    lastEndTime = word.end;
  }

  return parts.join("").trim();
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...fetchOptions, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

/**
 * Transcribe audio using Whisper ASR service
 */
export async function transcribeAudio(
  audioData: Buffer,
  mimeType: string,
  whisperUrl: string
): Promise<TranscriptionResult> {
  const extension = mimeType.includes("webm") ? "webm"
    : mimeType.includes("ogg") ? "ogg"
    : mimeType.includes("mp3") ? "mp3"
    : mimeType.includes("wav") ? "wav"
    : mimeType.includes("m4a") ? "m4a"
    : mimeType.includes("flac") ? "flac"
    : "webm";

  const formData = new FormData();
  formData.append(
    "audio_file",
    new Blob([new Uint8Array(audioData)], { type: mimeType }),
    `audio.${extension}`
  );

  const baseUrl = whisperUrl.replace(/\/$/, "");

  // Request word timestamps to detect pauses
  const response = await fetchWithTimeout(
    `${baseUrl}/asr?output=json&word_timestamps=true`,
    {
      method: "POST",
      body: formData,
      timeoutMs: STT_TIMEOUT_MS,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Whisper transcription failed: ${response.status} - ${text}`);
  }

  const result = await response.json() as WhisperResponse;

  // Calculate duration from last segment
  let duration: number | undefined;
  if (result.segments && result.segments.length > 0) {
    const lastSegment = result.segments[result.segments.length - 1];
    duration = lastSegment?.end;
  }

  // Process text with pause markers
  const text = result.segments
    ? insertPauseMarkers(result.segments)
    : result.text.trim();

  return {
    text,
    language: result.language,
    duration,
  };
}
