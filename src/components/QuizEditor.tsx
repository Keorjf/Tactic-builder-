import type { Quiz } from '@/lib/types';
import styles from './QuizEditor.module.css';

type Props = {
  quiz: Quiz;
  index: number;
  onChange: (patch: Partial<Quiz>) => void;
  onDelete: () => void;
};

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Edits one quiz: question, options (with correct-answer radio), explanation. */
export default function QuizEditor({ quiz, index, onChange, onDelete }: Props) {
  const setOpt = (i: number, value: string) => {
    const opts = [...quiz.opts];
    opts[i] = value;
    onChange({ opts });
  };
  const addOpt = () => {
    if (quiz.opts.length >= 5) return;
    onChange({ opts: [...quiz.opts, ''] });
  };
  const delOpt = (i: number) => {
    if (quiz.opts.length <= 2) return;
    const opts = quiz.opts.filter((_, k) => k !== i);
    const correct = quiz.correct >= opts.length ? opts.length - 1 : quiz.correct;
    onChange({ opts, correct });
  };

  return (
    <div className={styles.quiz}>
      <div className={styles.head}>
        <span className={styles.label}>Quiz {index + 1}</span>
        <button className={styles.del} onClick={onDelete} title="Delete quiz">
          🗑
        </button>
      </div>

      <input
        className="app-input"
        value={quiz.q}
        placeholder="Question…"
        onChange={(e) => onChange({ q: e.target.value })}
      />

      <div className={styles.opts}>
        {quiz.opts.map((opt, i) => (
          <div key={i} className={styles.optRow}>
            <button
              className={`${styles.correct} ${quiz.correct === i ? styles.correctOn : ''}`}
              onClick={() => onChange({ correct: i })}
              title="Mark as correct answer"
            >
              {LETTERS[i]}
            </button>
            <input
              className="app-input"
              value={opt}
              placeholder={`Option ${LETTERS[i]}`}
              onChange={(e) => setOpt(i, e.target.value)}
            />
            <button
              className={styles.delOpt}
              onClick={() => delOpt(i)}
              disabled={quiz.opts.length <= 2}
              title="Remove option"
            >
              ✕
            </button>
          </div>
        ))}
        {quiz.opts.length < 5 ? (
          <button className={styles.addOpt} onClick={addOpt}>
            + Add option
          </button>
        ) : null}
      </div>

      <label className="field-label" style={{ marginTop: '0.6rem' }}>
        Explanation
      </label>
      <textarea
        className="app-textarea"
        value={quiz.expl}
        placeholder="Why the correct answer is correct…"
        onChange={(e) => onChange({ expl: e.target.value })}
      />
    </div>
  );
}
