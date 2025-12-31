import { toasts, dismissToast } from '../../store/index.ts';
import styles from './Toast.module.css';

export function ToastContainer() {
  if (toasts.value.length === 0) return null;

  return (
    <div class={styles.container}>
      {toasts.value.map(toast => (
        <div key={toast.id} class={`${styles.toast} ${styles[toast.type]}`}>
          <span class={styles.message}>{toast.message}</span>
          <button class={styles.dismiss} onClick={() => dismissToast(toast.id)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
