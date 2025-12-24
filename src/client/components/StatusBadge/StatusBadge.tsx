import type { EntryStatus } from '../../types/index.ts';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: EntryStatus;
}

const statusLabels: Record<EntryStatus, string> = {
  pending_transcription: 'pending',
  transcribed: 'transcribed',
  analyzed: 'analyzed',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusClass = status.replace('_', '-');
  const label = statusLabels[status];

  return (
    <span class={`${styles.badge} ${styles[statusClass]}`}>
      {label}
    </span>
  );
}
