import { dataSafetyStatus, dataSafetyText } from '../../store/index.ts';
import styles from './DataSafetyIndicator.module.css';

export function DataSafetyIndicator() {
  const status = dataSafetyStatus.value;
  const text = dataSafetyText.value;

  if (status === 'hidden') {
    return null;
  }

  return (
    <div class={`${styles.indicator} ${styles[status]}`}>
      <span class={styles.icon}>●</span>
      <span>{text}</span>
    </div>
  );
}
