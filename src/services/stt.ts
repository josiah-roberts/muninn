import { config } from "../config.ts";
import { withRetry, fetchWithTimeout } from "./retry.ts";

// Timeout for STT requests (60 seconds - audio transcription can take time)
const STT_TIMEOUT_MS = 60_000;

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface STTProvider {
  transcribe(audioData: Buffer, mimeType: string): Promise<TranscriptionResult>;
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
    formData.append("audio_file", new Blob([audioData], { type: mimeType }), `audio.${extension}`);

    // Retry with exponential backoff and timeout
    return withRetry(
      async () => {
        const response = await fetchWithTimeout(`${this.baseUrl}/asr?output=json`, {
          method: "POST",
          body: formData,
          timeoutMs: STT_TIMEOUT_MS,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Whisper transcription failed: ${response.status} - ${text}`);
        }

        const result = await response.json() as { text: string };
        return {
          text: result.text.trim(),
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
