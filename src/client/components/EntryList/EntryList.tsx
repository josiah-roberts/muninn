import { entries, entriesLoading } from '../../store/index.ts';
import { useEntries } from '../../hooks/useEntries.ts';
import { EntryCard } from '../EntryCard/EntryCard.tsx';

export function EntryList() {
  const { openEntry } = useEntries();
  const loading = entriesLoading.value;
  const entryList = entries.value;

  if (loading) {
    return <div class="empty-state">Loading entries...</div>;
  }

  if (entryList.length === 0) {
    return <div class="empty-state">No entries yet. Start recording!</div>;
  }

  return (
    <div>
      {entryList.map(entry => (
        <EntryCard
          key={entry.id}
          entry={entry}
          onClick={() => openEntry(entry.id)}
        />
      ))}
    </div>
  );
}
