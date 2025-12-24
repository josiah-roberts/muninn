import { useEffect, useRef } from 'preact/hooks';
import { isRecording, recordingStartTime, elapsedSeconds } from '../store/index.ts';

export function useTimer() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording.value && recordingStartTime.value !== null) {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime.value!) / 1000);
        elapsedSeconds.value = elapsed;
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRecording.value, recordingStartTime.value]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return { formatTime };
}
