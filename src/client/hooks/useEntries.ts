import { entries, entriesLoading, interviewQuestions, selectedEntryId, isModalOpen, showToast } from '../store/index.ts';
import { fetchEntries, fetchEntry, fetchInterviewQuestions, transcribeEntry as apiTranscribe, retranscribeEntry as apiRetranscribe, analyzeEntry as apiAnalyze, deleteEntry as apiDelete } from '../api/client.ts';
import type { Entry } from '../types/index.ts';

export function useEntries() {
  const loadEntries = async () => {
    entriesLoading.value = true;
    try {
      const data = await fetchEntries(20);
      entries.value = data.entries;
    } catch (err) {
      console.error('Failed to load entries:', err);
      showToast('Failed to load entries');
    } finally {
      entriesLoading.value = false;
    }
  };

  const loadInterviewQuestions = async () => {
    try {
      const data = await fetchInterviewQuestions();
      interviewQuestions.value = data.questions || [];
    } catch (err) {
      console.error('Failed to load interview questions:', err);
      showToast('Failed to load interview questions');
    }
  };

  const openEntry = async (id: string) => {
    selectedEntryId.value = id;
    isModalOpen.value = true;
    // Refresh entry data when opening
    try {
      const entry = await fetchEntry(id);
      // Update the entry in the list
      entries.value = entries.value.map(e => e.id === id ? entry : e);
    } catch (err) {
      console.error('Failed to load entry:', err);
      showToast('Failed to load entry');
    }
  };

  const closeModal = () => {
    isModalOpen.value = false;
    selectedEntryId.value = null;
  };

  const transcribeEntry = async (id: string) => {
    try {
      await apiTranscribe(id);
      await loadEntries();
      await openEntry(id);
    } catch (err) {
      console.error('Transcription failed:', err);
      showToast('Transcription failed');
    }
  };

  const retranscribeEntry = async (id: string) => {
    try {
      await apiRetranscribe(id);
      await loadEntries();
      await openEntry(id);
    } catch (err) {
      console.error('Re-transcription failed:', err);
      showToast('Re-transcription failed');
    }
  };

  const analyzeEntry = async (id: string) => {
    try {
      await apiAnalyze(id);
      await loadEntries();
      await openEntry(id);
    } catch (err) {
      console.error('Analysis failed:', err);
      showToast('Analysis failed');
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await apiDelete(id);
      closeModal();
      await loadEntries();
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete entry');
    }
  };

  return {
    loadEntries,
    loadInterviewQuestions,
    openEntry,
    closeModal,
    transcribeEntry,
    retranscribeEntry,
    analyzeEntry,
    deleteEntry,
  };
}
