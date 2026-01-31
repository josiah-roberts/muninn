import type { Entry, EntriesResponse, InterviewQuestionsResponse } from '../types/index.ts';

export async function fetchEntries(limit = 20): Promise<EntriesResponse> {
  const res = await fetch(`/api/entries?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch entries');
  return res.json();
}

export async function fetchEntry(id: string): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}`);
  if (!res.ok) throw new Error('Failed to fetch entry');
  return res.json();
}

export async function createEntry(audio: Blob, mimeType: string): Promise<Entry> {
  const formData = new FormData();
  // Derive extension from mimeType for proper filename
  const ext = mimeType.includes('webm') ? 'webm'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : 'webm';
  // Create File with explicit type to ensure MIME type is preserved
  const file = new File([audio], `recording.${ext}`, { type: mimeType });
  formData.append('audio', file);

  // Use AbortController for timeout (60 second timeout for upload)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upload failed: ${res.status} ${text}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Upload timed out');
    }
    throw err;
  }
}

export async function transcribeEntry(id: string, prompt?: string): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('Transcription failed');
  return res.json();
}

export async function retranscribeEntry(id: string, prompt?: string): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}/retranscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('Re-transcription failed');
  return res.json();
}

export async function analyzeEntry(id: string): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}/analyze`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Analysis failed');
  return res.json();
}

export async function deleteEntry(id: string): Promise<void> {
  const res = await fetch(`/api/entries/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Delete failed');
}

export async function fetchInterviewQuestions(): Promise<InterviewQuestionsResponse> {
  const res = await fetch('/api/interview-questions');
  if (!res.ok) throw new Error('Failed to fetch interview questions');
  return res.json();
}
