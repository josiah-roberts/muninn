import { isRecording, statusText, elapsedSeconds } from '../../store/index.ts';
import { useTimer } from '../../hooks/useTimer.ts';
import styles from './RecordingStatus.module.css';

export function RecordingStatus() {
  const { formatTime } = useTimer();
  const recording = isRecording.value;
  const text = statusText.value;
  const seconds = elapsedSeconds.value;

  return (
    <>
      <div class={`${styles.status} ${recording ? styles.recording : ''}`}>
        {text}
      </div>
      {recording && (
        <div class={styles.time}>{formatTime(seconds)}</div>
      )}
    </>
  );
}
