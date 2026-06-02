import { useState } from 'react';
import Drawer from '@/components/Drawer';
import { useCorpus } from '@/store/corpus';
import { richText } from '@/lib/richtext';
import type { BlockType, Quiz } from '@/lib/types';
import styles from './PreviewDrawer.module.css';

const BLOCK_LABEL: Record<BlockType, string> = {
  hook: 'Hook',
  content: 'Content',
  tip: 'Tip',
  trap: 'Pitfall',
  real: 'Real example',
  info: 'Info',
};

export default function PreviewDrawer() {
  const lesson = useCorpus((s) => s.previewLesson);
  const close = useCorpus((s) => s.closePreview);
  const openEditor = useCorpus((s) => s.openEditor);
  const trackById = useCorpus((s) => s.trackById);

  if (!lesson) return null;
  const track = trackById(lesson.trackId);

  return (
    <Drawer
      open={!!lesson}
      onClose={close}
      width="min(640px, 100vw)"
      title={`${lesson.emoji} ${lesson.name}`}
      subtitle={`${lesson.id} · ${lesson.level} · ${lesson.tag}${
        track ? ` · ${track.emoji} ${track.nameFr}` : ''
      }`}
      actions={
        <button
          className="btn"
          onClick={() => {
            close();
            openEditor(lesson);
          }}
        >
          Edit
        </button>
      }
    >
      <div className={styles.meta}>
        <span className={styles.chip}>{lesson.duration}</span>
        <span className={styles.chip}>{lesson.coins} coins</span>
        <span className={styles.chip}>{lesson.xp} XP</span>
        <span
          className={`${styles.chip} ${
            lesson.status === 'published' ? styles.pub : styles.draft
          }`}
        >
          {lesson.status}
        </span>
      </div>

      {lesson.blocks.length === 0 ? (
        <div className={styles.empty}>No content blocks yet.</div>
      ) : (
        lesson.blocks.map((b, i) => (
          <div key={i} className={`${styles.block} ${styles[b.type] ?? ''}`}>
            <div className={styles.blockLabel}>
              {b.emo ? <span>{b.emo}</span> : null}
              {BLOCK_LABEL[b.type] ?? b.type}
            </div>
            <div className={styles.blockBody}>{richText(b.text)}</div>
          </div>
        ))
      )}

      {lesson.quizzes.map((q, i) => (
        <QuizPreview key={i} quiz={q} index={i} />
      ))}
    </Drawer>
  );
}

function QuizPreview({ quiz, index }: { quiz: Quiz; index: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const letters = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div className={styles.quiz}>
      <div className={styles.quizLabel}>Quiz {index + 1}</div>
      <div className={styles.quizQ}>{quiz.q || '(no question)'}</div>
      <div className={styles.quizOpts}>
        {quiz.opts.map((opt, i) => {
          const answered = picked !== null;
          const isCorrect = i === quiz.correct;
          const isPicked = i === picked;
          const cls = !answered
            ? ''
            : isCorrect
            ? styles.optCorrect
            : isPicked
            ? styles.optWrong
            : '';
          return (
            <button
              key={i}
              className={`${styles.opt} ${cls}`}
              onClick={() => setPicked(i)}
              disabled={answered}
            >
              <span className={styles.optLetter}>{letters[i]}</span>
              {opt || '(empty)'}
            </button>
          );
        })}
      </div>
      {picked !== null && quiz.expl ? (
        <div className={styles.expl}>{richText(quiz.expl)}</div>
      ) : null}
    </div>
  );
}
