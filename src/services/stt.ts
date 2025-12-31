import { config } from "../config.ts";
import { withRetry, fetchWithTimeout } from "./retry.ts";

// Timeout for STT requests (3 minutes - longer recordings need more processing time)
const STT_TIMEOUT_MS = 180_000;

// Pause threshold in seconds - gaps >= this get a marker
const PAUSE_THRESHOLD_SECONDS = 2;

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface STTProvider {
  transcribe(audioData: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

// Word-level timestamp from Whisper
interface WhisperWord {
  start: number;
  end: number;
  word: string;
  probability: number;
}

// Segment from Whisper response
interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

// Full Whisper response with word timestamps
interface WhisperResponse {
  text: string;
  language?: string;
  segments?: WhisperSegment[];
}

/**
 * Process word timestamps to insert pause markers for gaps > threshold
 */
function insertPauseMarkers(segments: WhisperSegment[], thresholdSeconds: number): string {
  const allWords: WhisperWord[] = [];

  // Flatten all words from all segments
  for (const segment of segments) {
    if (segment.words) {
      allWords.push(...segment.words);
    }
  }

  if (allWords.length === 0) {
    // Fallback to segment text if no word timestamps
    return segments.map(s => s.text).join(" ").trim();
  }

  const parts: string[] = [];
  let lastEndTime = 0;

  for (const word of allWords) {
    const gap = word.start - lastEndTime;

    // Insert pause marker for significant gaps
    if (gap >= thresholdSeconds && parts.length > 0) {
      const pauseSeconds = Math.round(gap);
      parts.push(` [${pauseSeconds}s]`);
    }

    parts.push(word.word);
    lastEndTime = word.end;
  }

  // Join and clean up spacing (words already have leading spaces)
  return parts.join("").trim();
}

// Faster-Whisper via openai-whisper-asr-webservice
// https://github.com/ahmetoner/whisper-asr-webservice
class FasterWhisperProvider implements STTProvider {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async transcribe(audioData: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const extension = mimeType.includes("webm") ? "webm"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("mp3") ? "mp3"
      : mimeType.includes("wav") ? "wav"
      : "webm";

    const formData = new FormData();
    formData.append("audio_file", new Blob([new Uint8Array(audioData)], { type: mimeType }), `audio.${extension}`);

    // Retry with exponential backoff and timeout
    return withRetry(
      async () => {
        // Request word timestamps to detect pauses
        const response = await fetchWithTimeout(
          `${this.baseUrl}/asr?output=json&word_timestamps=true`,
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
          ? insertPauseMarkers(result.segments, PAUSE_THRESHOLD_SECONDS)
          : result.text.trim();

        return {
          text,
          language: result.language,
          duration,
        };
      },
      {
        maxAttempts: 3,
        onRetry: (error, attempt, delayMs) => {
          console.warn(`STT retry attempt ${attempt} after ${delayMs}ms:`, error);
        },
      }
    );
  }
}

// Factory for creating STT provider
export function createSTTProvider(): STTProvider {
  return new FasterWhisperProvider(config.whisperUrl);
}

// Singleton instance
let sttProvider: STTProvider | null = null;

export function getSTTProvider(): STTProvider {
  if (!sttProvider) {
    sttProvider = createSTTProvider();
  }
  return sttProvider;
}
