import styles from './Header.module.css';

interface HeaderProps {
  userEmail: string;
}

export function Header({ userEmail }: HeaderProps) {
  return (
    <header class={styles.header}>
      <h1>Journal</h1>
      <div class={styles.userInfo}>
        <span>{userEmail}</span>
        <a href="/auth/logout">Logout</a>
      </div>
    </header>
  );
}
