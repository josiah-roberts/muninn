import { useRef } from 'preact/hooks';
import { isRecording, isUploading } from '../../store/index.ts';
import { useRecording } from '../../hooks/useRecording.ts';
import styles from './UploadButton.module.css';

export function UploadButton() {
  const { uploadFile } = useRecording();
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = isRecording.value || isUploading.value;

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      uploadFile(file);
      input.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        class={styles.hiddenInput}
        onChange={handleFileChange}
      />
      <button
        class={`${styles.button} ${disabled ? styles.disabled : ''}`}
        onClick={handleClick}
        disabled={disabled}
        title="Upload audio file"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </button>
    </>
  );
}
