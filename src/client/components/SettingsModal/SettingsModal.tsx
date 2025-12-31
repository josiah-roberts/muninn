import { useEffect, useState } from 'preact/hooks';
import { showToast } from '../../store/index.ts';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [overview, setOverview] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current overview when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/settings/agent-overview')
        .then(r => r.json())
        .then(data => {
          setOverview(data.overview || '');
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load settings:', err);
          showToast('Failed to load settings');
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/settings/agent-overview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overview }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class={styles.overlay} onClick={handleOverlayClick}>
      <div class={styles.modal}>
        <div class={styles.header}>
          <h3>Settings</h3>
          <button class={styles.close} onClick={onClose}>
            &times;
          </button>
        </div>
        <div class={styles.body}>
          <div class={styles.section}>
            <h4>Agent Context</h4>
            <p class={styles.description}>
              This text is provided to the AI analysis agent before it processes your entries.
              Use it to share context about yourself, recurring themes, people in your life,
              or any instructions for how you want your entries analyzed.
            </p>
            {loading ? (
              <div class={styles.loading}>Loading...</div>
            ) : (
              <textarea
                class={styles.textarea}
                value={overview}
                onInput={(e) => setOverview((e.target as HTMLTextAreaElement).value)}
                placeholder="e.g., I'm a software engineer working on AI. My partner is Alex. Key themes I'm exploring: career growth, work-life balance, mindfulness practice..."
                rows={10}
              />
            )}
          </div>
          <div class={styles.actions}>
            <button
              class={`${styles.btn} ${styles.primary}`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
            </button>
            <button class={styles.btn} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
