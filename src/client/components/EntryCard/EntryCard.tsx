import type { Entry } from '../../types/index.ts';
import { StatusBadge } from '../StatusBadge/StatusBadge.tsx';
import { Tag } from '../Tag/Tag.tsx';
import styles from './EntryCard.module.css';

interface EntryCardProps {
  entry: Entry;
  onClick: () => void;
}

export function EntryCard({ entry, onClick }: EntryCardProps) {
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const tags = entry.tags || [];

  return (
    <div class={styles.card} onClick={onClick}>
      <div class={styles.title}>{entry.title || 'Untitled Entry'}</div>
      <div class={styles.meta}>
        <span>{date}</span>
        <StatusBadge status={entry.status} />
      </div>
      {tags.length > 0 && (
        <div class={styles.tags}>
          {tags.map(t => <Tag key={t} name={t} />)}
        </div>
      )}
    </div>
  );
}
