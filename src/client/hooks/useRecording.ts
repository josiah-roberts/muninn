import { useRef, useEffect } from 'preact/hooks';
import {
  isRecording,
  isUploading,
  recordingStartTime,
  dataSafetyStatus,
  dataSafetyText,
  statusText,
  elapsedSeconds,
  entries,
  showToast,
  uploadProgress,
  uploadTotal,
} from '../store/index.ts';
import { createEntry, transcribeEntry, analyzeEntry } from '../api/client.ts';

export function useRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake lock request failed:', err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

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

      // Prevent screen from sleeping during recording
      acquireWakeLock();

    } catch (err) {
      console.error('Failed to start recording:', err);
      const error = err as Error;
      statusText.value = `Mic error: ${error.name || 'unknown'}`;
      showToast(`Failed to start recording: ${error.message || 'microphone access denied'}`);
    }
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording.value = false;
    statusText.value = 'Uploading...';
    releaseWakeLock();
  };

  const uploadRecording = async () => {
    const chunks = audioChunksRef.current;
    const mediaRecorder = mediaRecorderRef.current;

    if (chunks.length === 0) {
      statusText.value = 'No audio recorded';
      return;
    }

    const mimeType = mediaRecorder?.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mimeType });

    // Retry logic with exponential backoff
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          statusText.value = `Retry ${attempt}/${maxRetries - 1}...`;
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        updateDataSafety('pending', 'Uploading...');
        statusText.value = 'Uploading...';

        let currentEntry = await createEntry(blob, mimeType);

        // Upload succeeded - now safe to clear chunks
        audioChunksRef.current = [];

        // Add entry to list immediately
        entries.value = [currentEntry, ...entries.value];

        updateDataSafety('safe', 'Audio saved');
        statusText.value = 'Transcribing...';

        try {
          currentEntry = await transcribeEntry(currentEntry.id);
          // Update entry in-place
          entries.value = entries.value.map(e => e.id === currentEntry.id ? currentEntry : e);

          statusText.value = 'Analyzing...';

          try {
            currentEntry = await analyzeEntry(currentEntry.id);
            // Update entry in-place with analysis data
            entries.value = entries.value.map(e => e.id === currentEntry.id ? currentEntry : e);
            statusText.value = 'Entry saved and analyzed!';
          } catch (err) {
            console.error('Analysis failed:', err);
            statusText.value = 'Entry saved (analysis pending)';
            showToast('Analysis failed - you can retry from the entry');
          }
        } catch (err) {
          console.error('Transcription failed:', err);
          statusText.value = 'Entry saved (transcription pending)';
          showToast('Transcription failed - you can retry from the entry');
        }

        setTimeout(() => {
          statusText.value = 'Tap to start recording';
          dataSafetyStatus.value = 'hidden';
        }, 3000);

        return; // Success, exit retry loop

      } catch (err) {
        lastError = err as Error;
        console.error(`Upload attempt ${attempt + 1} failed:`, err);
      }
    }

    // All retries failed
    console.error('All upload attempts failed:', lastError);
    updateDataSafety('pending', 'Upload failed - audio preserved');
    statusText.value = `Upload failed: ${lastError?.message || 'unknown error'}`;
    showToast(`Upload failed after ${maxRetries} attempts`);
    // Note: audioChunksRef still has the data, could add manual retry button
  };

  const toggleRecording = () => {
    if (isRecording.value) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const processOneFile = async (file: File, index: number, total: number) => {
    const prefix = total > 1 ? `[${index}/${total}] ` : '';

    updateDataSafety('pending', `${prefix}Uploading...`);
    statusText.value = `${prefix}Uploading...`;

    let currentEntry = await createEntry(file, file.type);

    // Add entry to list immediately
    entries.value = [currentEntry, ...entries.value];

    updateDataSafety('safe', `${prefix}Audio saved`);
    statusText.value = `${prefix}Transcribing...`;

    try {
      currentEntry = await transcribeEntry(currentEntry.id);
      entries.value = entries.value.map(e => e.id === currentEntry.id ? currentEntry : e);

      statusText.value = `${prefix}Analyzing...`;

      try {
        currentEntry = await analyzeEntry(currentEntry.id);
        entries.value = entries.value.map(e => e.id === currentEntry.id ? currentEntry : e);
      } catch (err) {
        console.error('Analysis failed:', err);
        showToast(`Analysis failed for ${file.name} - you can retry from the entry`);
      }
    } catch (err) {
      console.error('Transcription failed:', err);
      showToast(`Transcription failed for ${file.name} - you can retry from the entry`);
    }
  };

  const uploadFile = async (files: File | File[]) => {
    if (isRecording.value || isUploading.value) {
      return;
    }

    const fileList = Array.isArray(files) ? files : [files];
    if (fileList.length === 0) return;

    isUploading.value = true;
    uploadTotal.value = fileList.length;
    uploadProgress.value = 0;

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < fileList.length; i++) {
      uploadProgress.value = i + 1;
      try {
        await processOneFile(fileList[i], i + 1, fileList.length);
        successCount++;
      } catch (err) {
        const error = err as Error;
        console.error(`Upload failed for ${fileList[i].name}:`, error);
        failCount++;
        showToast(`Upload failed for ${fileList[i].name}: ${error.message || 'unknown error'}`);
      }
    }

    // Summary status
    if (fileList.length > 1) {
      if (failCount === 0) {
        statusText.value = `All ${successCount} files processed!`;
        showToast(`Successfully processed ${successCount} files`, 'success');
      } else {
        statusText.value = `Done: ${successCount} succeeded, ${failCount} failed`;
      }
    } else {
      statusText.value = successCount > 0 ? 'Entry saved and analyzed!' : 'Upload failed';
    }

    updateDataSafety('safe', 'Done');

    setTimeout(() => {
      statusText.value = 'Tap to start recording';
      dataSafetyStatus.value = 'hidden';
      uploadProgress.value = 0;
      uploadTotal.value = 0;
    }, 3000);

    isUploading.value = false;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      releaseWakeLock();
    };
  }, []);

  return { toggleRecording, uploadFile };
}
