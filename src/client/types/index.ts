export type EntryStatus = 'pending_transcription' | 'transcribed' | 'analyzed';

export interface Entry {
  id: string;
  title: string | null;
  transcript: string | null;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  status: EntryStatus;
  analysis_json: string | null;
  follow_up_questions: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface LinkedEntry {
  id: string;
  title: string | null;
  relationship: string;
}

export interface Analysis {
  title: string;
  summary: string;
  themes: string[];
  key_insights: string[];
  follow_up_questions: string[];
  tags: string[];
}

export interface EntriesResponse {
  entries: Entry[];
  total: number;
}

export interface InterviewQuestionsResponse {
  questions: string[];
}
