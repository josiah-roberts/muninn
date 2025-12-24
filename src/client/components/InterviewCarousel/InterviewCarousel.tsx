import { useRef } from 'preact/hooks';
import { interviewQuestions, currentQuestionIndex } from '../../store/index.ts';
import styles from './InterviewCarousel.module.css';

export function InterviewCarousel() {
  const questions = interviewQuestions.value;
  const currentIndex = currentQuestionIndex.value;
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  if (questions.length === 0) {
    return null;
  }

  const showQuestion = (index: number) => {
    currentQuestionIndex.value = index;
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches[0]) {
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches[0]) {
      touchEndX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50; // minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentIndex < questions.length - 1) {
        // Swiped left - go to next
        showQuestion(currentIndex + 1);
      } else if (diff < 0 && currentIndex > 0) {
        // Swiped right - go to previous
        showQuestion(currentIndex - 1);
      }
    }
  };

  return (
    <div
      class={styles.section}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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
