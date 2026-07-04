import { useMemo, useState } from 'react';
import Drawer from '@/components/Drawer';
import { useCorpus } from '@/store/corpus';
import { richText } from '@/lib/richtext';
import type { Block, BlockType, Quiz } from '@/lib/types';
import styles from './PreviewDrawer.module.css';

const BLOCK_LABEL: Record<BlockType, string> = {
  hook: 'Hook',
  content: 'Content',
  tip: 'Tip',
  trap: 'Pitfall',
  real: 'Real example',
  info: 'Info',
};

type Lang = 'fr' | 'en' | 'es';
const LANG_LABEL: Record<Lang, string> = { fr: '🇫🇷 FR', en: '🇬🇧 EN', es: '🇪🇸 ES' };

export default function PreviewDrawer() {
  const lesson = useCorpus((s) => s.previewLesson);
  const close = useCorpus((s) => s.closePreview);
  const openEditor = useCorpus((s) => s.openEditor);
  const trackById = useCorpus((s) => s.trackById);

  const [lang, setLang] = useState<Lang>('fr');

  // Which languages exist for this lesson (FR always + translated ones).
  const langs = useMemo<Lang[]>(() => {
    if (!lesson) return ['fr'];
    const out: Lang[] = ['fr'];
    if (lesson.translations?.en?.blocks?.length || lesson.translations?.en?.title) out.push('en');
    if (lesson.translations?.es?.blocks?.length || lesson.translations?.es?.title) out.push('es');
    return out;
  }, [lesson]);

  if (!lesson) return null;
  const track = trackById(lesson.trackId);

  // Resolve the content to render for the selected language.
  const active = lang === 'fr' ? null : lesson.translations?.[lang];
  const title = active?.title || lesson.name;
  const blocks: Block[] = (active?.blocks?.length ? active.blocks : lesson.blocks) as Block[];
  const quizzes: Quiz[] = active?.quizzes?.length ? active.quizzes : lesson.quizzes;

  return (
    <Drawer
      open={!!lesson}
      onClose={close}
      width="min(640px, 100vw)"
      title={`${lesson.emoji} ${title}`}
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

      {/* Language tabs — visibility of all translations */}
      <div className={styles.langTabs}>
        {(['fr', 'en', 'es'] as Lang[]).map((l) => {
          const present = langs.includes(l);
          return (
            <button
              key={l}
              className={`${styles.langTab} ${lang === l ? styles.langActive : ''} ${
                present ? '' : styles.langMissing
              }`}
              onClick={() => present && setLang(l)}
              disabled={!present}
              title={present ? '' : 'Not translated yet'}
            >
              {LANG_LABEL[l]}
            </button>
          );
        })}
      </div>

      {lesson.summary ? (
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>Summary</div>
          <div className={styles.summaryText}>{lesson.summary}</div>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <div className={styles.empty}>No content blocks yet.</div>
      ) : (
        blocks.map((b, i) => (
          <div key={i} className={`${styles.block} ${styles[b.type] ?? ''}`}>
            <div className={styles.blockLabel}>
              {b.emo ? <span>{b.emo}</span> : null}
              {BLOCK_LABEL[b.type] ?? b.type}
            </div>
            <div className={styles.blockBody}>{richText(b.text)}</div>
          </div>
        ))
      )}

      {quizzes.map((q, i) => (
        <QuizPreview key={`${lang}-${i}`} quiz={q} index={i} />
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
