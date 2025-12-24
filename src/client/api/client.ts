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

  const res = await fetch('/api/entries', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function transcribeEntry(id: string): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}/transcribe`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Transcription failed');
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
