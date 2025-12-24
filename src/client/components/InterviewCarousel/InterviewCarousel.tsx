import { interviewQuestions, currentQuestionIndex } from '../../store/index.ts';
import styles from './InterviewCarousel.module.css';

export function InterviewCarousel() {
  const questions = interviewQuestions.value;
  const currentIndex = currentQuestionIndex.value;

  if (questions.length === 0) {
    return null;
  }

  const showQuestion = (index: number) => {
    currentQuestionIndex.value = index;
  };

  return (
    <div class={styles.section}>
      <h3 class={styles.title}>Something to think about...</h3>
      <p class={styles.prompt}>{questions[currentIndex]}</p>
      <div class={styles.nav}>
        {questions.map((_, i) => (
          <button
            key={i}
            class={`${styles.dot} ${i === currentIndex ? styles.active : ''}`}
            onClick={() => showQuestion(i)}
          />
        ))}
      </div>
    </div>
  );
}
