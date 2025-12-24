import { signal, computed } from '@preact/signals';
import type { Entry } from '../types/index.ts';

// Recording state
export const isRecording = signal(false);
export const recordingStartTime = signal<number | null>(null);
export const dataSafetyStatus = signal<'safe' | 'pending' | 'hidden'>('hidden');
export const dataSafetyText = signal('');
export const statusText = signal('Tap to start recording');

// Timer state
export const elapsedSeconds = signal(0);

// Entries state
export const entries = signal<Entry[]>([]);
export const entriesLoading = signal(true);
export const selectedEntryId = signal<string | null>(null);
export const isModalOpen = signal(false);

// Computed: selected entry details
export const selectedEntry = computed(() => {
  const id = selectedEntryId.value;
  if (!id) return null;
  return entries.value.find(e => e.id === id) || null;
});

// Interview questions
export const interviewQuestions = signal<string[]>([]);
export const currentQuestionIndex = signal(0);
