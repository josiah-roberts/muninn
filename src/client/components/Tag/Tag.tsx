import styles from './Tag.module.css';

interface TagProps {
  name: string;
}

export function Tag({ name }: TagProps) {
  return <span class={styles.tag}>{name}</span>;
}
