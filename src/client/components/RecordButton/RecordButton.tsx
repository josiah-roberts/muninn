import { isRecording } from '../../store/index.ts';
import { useRecording } from '../../hooks/useRecording.ts';
import styles from './RecordButton.module.css';

export function RecordButton() {
  const { toggleRecording } = useRecording();
  const recording = isRecording.value;

  return (
    <button
      class={`${styles.button} ${recording ? styles.recording : ''}`}
      onClick={toggleRecording}
    >
      {recording ? (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      ) : (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      )}
    </button>
  );
}
