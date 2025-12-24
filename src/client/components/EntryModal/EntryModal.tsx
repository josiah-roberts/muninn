import { useEffect } from 'preact/hooks';
import { isModalOpen, selectedEntry } from '../../store/index.ts';
import { useEntries } from '../../hooks/useEntries.ts';
import { Tag } from '../Tag/Tag.tsx';
import type { Analysis } from '../../types/index.ts';
import styles from './EntryModal.module.css';

export function EntryModal() {
  const { closeModal, transcribeEntry, analyzeEntry, deleteEntry } = useEntries();
  const open = isModalOpen.value;
  const entry = selectedEntry.value;

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (!open || !entry) {
    return null;
  }

  let analysis: Analysis | null = null;
  if (entry.analysis_json) {
    try {
      analysis = JSON.parse(entry.analysis_json);
    } catch {}
  }

  let followUps: string[] = [];
  if (entry.follow_up_questions) {
    try {
      followUps = JSON.parse(entry.follow_up_questions);
    } catch {}
  }

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  };

  return (
    <div class={`${styles.overlay} ${styles.open}`} onClick={handleOverlayClick}>
      <div class={styles.modal}>
        <div class={styles.header}>
          <h3>{entry.title || 'Untitled Entry'}</h3>
          <button class={styles.close} onClick={closeModal}>✕</button>
        </div>
        <div class={styles.body}>
          {entry.audio_path && (
            <audio
              class={styles.audio}
              controls
              src={`/api/entries/${entry.id}/audio`}
            />
          )}

          <div class={styles.transcriptSection}>
            <h4>Transcript</h4>
            <div class={styles.transcriptText}>
              {entry.transcript || 'No transcript yet'}
            </div>
          </div>

          <div class={styles.actions}>
            {entry.status === 'pending_transcription' && (
              <button
                class={`${styles.btn} ${styles.primary}`}
                onClick={() => transcribeEntry(entry.id)}
              >
                Transcribe
              </button>
            )}
            {entry.status === 'transcribed' && (
              <button
                class={`${styles.btn} ${styles.primary}`}
                onClick={() => analyzeEntry(entry.id)}
              >
                Analyze
              </button>
            )}
            <button
              class={`${styles.btn} ${styles.danger}`}
              onClick={() => deleteEntry(entry.id)}
            >
              Delete
            </button>
          </div>

          {analysis && (
            <div class={styles.analysisSection}>
              <h4>Summary</h4>
              <p class={styles.summary}>{analysis.summary}</p>

              {analysis.themes?.length > 0 && (
                <>
                  <h4>Themes</h4>
                  <div class={styles.tags}>
                    {analysis.themes.map(t => <Tag key={t} name={t} />)}
                  </div>
                </>
              )}

              {analysis.key_insights?.length > 0 && (
                <>
                  <h4>Key Insights</h4>
                  <ul class={styles.insights}>
                    {analysis.key_insights.map((insight, i) => (
                      <li key={i}>{insight}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {followUps.length > 0 && (
            <div class={styles.analysisSection}>
              <h4>Follow-up Questions</h4>
              <div class={styles.followUps}>
                {followUps.map((q, i) => (
                  <div key={i} class={styles.followUp}>{q}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
