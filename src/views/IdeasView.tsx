import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import {
  aiLessonIdeas,
  aiModuleIdeas,
  type LessonIdea,
  type ModuleIdea,
} from '@/lib/ai';
import { LEVELS, type Level } from '@/lib/types';
import { toast } from '@/components/Toast';
import Loader from '@/components/Loader';
import styles from './IdeasView.module.css';

type Mode = 'lesson' | 'module';

export default function IdeasView() {
  const loaded = useCorpus((s) => s.loaded);
  const loading = useCorpus((s) => s.loading);
  const load = useCorpus((s) => s.load);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);
  const openEditor = useCorpus((s) => s.openEditor);

  const [mode, setMode] = useState<Mode>('lesson');
  const [level, setLevel] = useState<Level>('Débutant');
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const [lessonIdeas, setLessonIdeas] = useState<LessonIdea[]>([]);
  const [moduleIdeas, setModuleIdeas] = useState<ModuleIdea[]>([]);

  useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);

  const existingLessons = useMemo(
    () => lessons.filter((l) => l.level === level).map((l) => l.name),
    [lessons, level]
  );
  const existingTracks = useMemo(
    () => tracks.map((t) => t.nameFr),
    [tracks]
  );

  const generate = async () => {
    setBusy(true);
    if (mode === 'lesson') {
      const res = await aiLessonIdeas({ level, theme: theme.trim() || undefined, existing: existingLessons });
      setBusy(false);
      if (!res.ok) {
        toast(`Failed: ${res.error}`, 'error');
        return;
      }
      setLessonIdeas(res.data.ideas ?? []);
    } else {
      const res = await aiModuleIdeas({ level, existing: existingTracks });
      setBusy(false);
      if (!res.ok) {
        toast(`Failed: ${res.error}`, 'error');
        return;
      }
      setModuleIdeas(res.data.ideas ?? []);
    }
  };

  const useIdea = (idea: LessonIdea) => {
    openEditor({
      id: '',
      trackId: null,
      emoji: idea.emoji || '📖',
      name: idea.name,
      duration: '1 min',
      coins: 80,
      xp: 60,
      tag: idea.tag || 'Core',
      level,
      blocks: [],
      quizzes: [{ q: '', opts: ['', '', '', ''], correct: 0, expl: '' }],
      translations: {},
      status: 'published',
    });
    toast('Editor opened — use AI Generate to fill the body.', 'info');
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Ideas</h1>
        <p className={styles.sub}>
          Brainstorm new lessons or whole tracks — AI proposes, you decide what to keep.
        </p>
      </div>

      <div className={styles.controls}>
        <div className={styles.modeRow}>
          <button
            className={`${styles.modeBtn} ${mode === 'lesson' ? styles.modeActive : ''}`}
            onClick={() => setMode('lesson')}
          >
            Lessons
          </button>
          <button
            className={`${styles.modeBtn} ${mode === 'module' ? styles.modeActive : ''}`}
            onClick={() => setMode('module')}
          >
            Tracks
          </button>
        </div>

        <div className={styles.row}>
          <label className={styles.label}>
            Level
            <select
              className="app-select"
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
            >
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </label>
          {mode === 'lesson' ? (
            <label className={styles.label} style={{ flex: 1 }}>
              Theme (optional)
              <input
                className="app-input"
                value={theme}
                placeholder="e.g. options trading, taxes, behavioural"
                onChange={(e) => setTheme(e.target.value)}
              />
            </label>
          ) : null}
          <button className={styles.runBtn} onClick={() => void generate()} disabled={busy}>
            {busy ? 'Brainstorming…' : '✨ Generate ideas'}
          </button>
        </div>
      </div>

      {busy ? <Loader label="Generating ideas…" /> : null}

      {mode === 'lesson' && lessonIdeas.length > 0 && !busy && (
        <div className={styles.grid}>
          {lessonIdeas.map((i, k) => (
            <div key={k} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardEmoji}>{i.emoji}</span>
                <span className={styles.cardTag}>{i.tag}</span>
              </div>
              <div className={styles.cardName}>{i.name}</div>
              <div className={styles.cardWhy}>{i.why}</div>
              <button className={styles.useBtn} onClick={() => useIdea(i)}>
                Use this idea →
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === 'module' && moduleIdeas.length > 0 && !busy && (
        <div className={styles.grid}>
          {moduleIdeas.map((i, k) => (
            <div key={k} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardEmoji}>{i.emoji}</span>
                <span className={styles.cardTag}>Track</span>
              </div>
              <div className={styles.cardName}>{i.name}</div>
              <div className={styles.cardWhy}>{i.why}</div>
              <div className={styles.cardHint}>
                Create the track from the lesson editor (Module dropdown → + New module).
              </div>
            </div>
          ))}
        </div>
      )}

      {!busy && lessonIdeas.length === 0 && moduleIdeas.length === 0 && (
        <div className={styles.empty}>
          Pick a level and click <strong>Generate</strong> to brainstorm fresh content ideas.
        </div>
      )}
    </div>
  );
}
