import { useRef, useEffect } from 'preact/hooks';
import {
  isRecording,
  recordingStartTime,
  dataSafetyStatus,
  dataSafetyText,
  statusText,
  elapsedSeconds,
  entries,
} from '../store/index.ts';
import { createEntry, transcribeEntry, analyzeEntry } from '../api/client.ts';
import { fetchEntries } from '../api/client.ts';

export function useRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const updateDataSafety = (status: 'safe' | 'pending' | 'hidden', text: string) => {
    dataSafetyStatus.value = status;
    dataSafetyText.value = text;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,  // Simple constraint - let browser pick best settings
      });

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          updateDataSafety('pending', 'Buffering...');
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        await uploadRecording();
      };

      mediaRecorder.start(5000);

      isRecording.value = true;
      recordingStartTime.value = Date.now();
      elapsedSeconds.value = 0;
      statusText.value = 'Recording...';

    } catch (err) {
      console.error('Failed to start recording:', err);
      const error = err as Error;
      statusText.value = `Mic error: ${error.name || 'unknown'}`;
    }
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording.value = false;
    statusText.value = 'Uploading...';
  };

  const uploadRecording = async () => {
    const chunks = audioChunksRef.current;
    const mediaRecorder = mediaRecorderRef.current;

    if (chunks.length === 0) {
      statusText.value = 'No audio recorded';
      return;
    }

    updateDataSafety('pending', 'Uploading...');

    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
    audioChunksRef.current = []; // Clear to free memory

    try {
      const entry = await createEntry(blob, mediaRecorder?.mimeType || 'audio/webm');

      updateDataSafety('safe', 'Audio saved');
      statusText.value = 'Transcribing...';

      try {
        await transcribeEntry(entry.id);
        statusText.value = 'Analyzing...';

        try {
          await analyzeEntry(entry.id);
          statusText.value = 'Entry saved and analyzed!';
        } catch (err) {
          console.error('Analysis failed:', err);
          statusText.value = 'Entry saved (analysis pending)';
        }
      } catch (err) {
        console.error('Transcription failed:', err);
        statusText.value = 'Entry saved (transcription pending)';
      }

      // Reload entries
      const data = await fetchEntries(20);
      entries.value = data.entries;

      setTimeout(() => {
        statusText.value = 'Tap to start recording';
        dataSafetyStatus.value = 'hidden';
      }, 3000);

    } catch (err) {
      console.error('Upload error:', err);
      updateDataSafety('pending', 'Upload failed - retrying...');
      statusText.value = 'Upload failed';
    }
  };

  const toggleRecording = () => {
    if (isRecording.value) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { toggleRecording };
}
