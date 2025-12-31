import { useState } from 'preact/hooks';
import { SettingsModal } from '../SettingsModal/SettingsModal.tsx';
import styles from './Header.module.css';

interface HeaderProps {
  userEmail: string;
}

export function Header({ userEmail }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header class={styles.header}>
        <h1>Muninn</h1>
        <div class={styles.userInfo}>
          <button
            class={styles.settingsBtn}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
          <span>{userEmail}</span>
          <a href="/auth/logout">Logout</a>
        </div>
      </header>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
