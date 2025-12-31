import { useEffect } from 'preact/hooks';
import { Header } from './components/Header/Header.tsx';
import { InterviewCarousel } from './components/InterviewCarousel/InterviewCarousel.tsx';
import { RecordButton } from './components/RecordButton/RecordButton.tsx';
import { RecordingStatus } from './components/RecordingStatus/RecordingStatus.tsx';
import { DataSafetyIndicator } from './components/DataSafetyIndicator/DataSafetyIndicator.tsx';
import { EntryList } from './components/EntryList/EntryList.tsx';
import { EntryModal } from './components/EntryModal/EntryModal.tsx';
import { ToastContainer } from './components/Toast/Toast.tsx';
import { useEntries } from './hooks/useEntries.ts';
import styles from './App.module.css';

export function App() {
  const appEl = document.getElementById('app');
  const userEmail = appEl?.dataset.userEmail || '';
  const { loadEntries, loadInterviewQuestions } = useEntries();

  useEffect(() => {
    loadEntries();
    loadInterviewQuestions();
  }, []);

  return (
    <>
      <Header userEmail={userEmail} />
      <main class={styles.main}>
        <InterviewCarousel />
        <div class={styles.recordSection}>
          <RecordButton />
          <RecordingStatus />
          <DataSafetyIndicator />
        </div>
        <div class={styles.entriesHeader}>
          <h2>Recent Entries</h2>
        </div>
        <EntryList />
      </main>
      <EntryModal />
      <ToastContainer />
    </>
  );
}
