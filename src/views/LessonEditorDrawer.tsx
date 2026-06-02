import { useEffect, useState } from 'react';
import Drawer from '@/components/Drawer';
import BlockEditor from '@/components/BlockEditor';
import QuizEditor from '@/components/QuizEditor';
import { useCorpus, newLessonId } from '@/store/corpus';
import { LEVELS, TAGS, type Block, type BlockType, type Lesson, type Quiz } from '@/lib/types';
import { toast } from '@/components/Toast';
import styles from './LessonEditorDrawer.module.css';

const DURATIONS = ['1 min', '2 min', '3 min', '5 min'];
const COIN_OPTIONS = [80, 100, 120, 150, 200];

function emptyQuiz(): Quiz {
  return { q: '', opts: ['', '', '', ''], correct: 0, expl: '' };
}

function blankLesson(): Lesson {
  return {
    id: '',
    trackId: null,
    emoji: '📖',
    name: '',
    duration: '1 min',
    coins: 80,
    xp: 60,
    tag: 'Core',
    level: 'Débutant',
    blocks: [],
    quizzes: [emptyQuiz()],
    translations: {},
    status: 'published',
  };
}

export default function LessonEditorDrawer() {
  const open = useCorpus((s) => s.editorOpen);
  const editing = useCorpus((s) => s.editingLesson);
  const tracks = useCorpus((s) => s.tracks);
  const lessons = useCorpus((s) => s.lessons);
  const close = useCorpus((s) => s.closeEditor);
  const saveLesson = useCorpus((s) => s.saveLesson);
  const saveTrack = useCorpus((s) => s.saveTrack);

  const [form, setForm] = useState<Lesson>(blankLesson());
  const [busy, setBusy] = useState(false);
  const isEdit = !!editing;

  // Seed the form when the drawer opens.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...editing,
        blocks: editing.blocks.map((b) => ({ ...b })),
        quizzes: editing.quizzes.length ? editing.quizzes.map((q) => ({ ...q })) : [emptyQuiz()],
      });
    } else {
      setForm(blankLesson());
    }
  }, [open, editing]);

  const patch = (p: Partial<Lesson>) => setForm((f) => ({ ...f, ...p }));

  const addBlock = (type: BlockType) =>
    setForm((f) => ({ ...f, blocks: [...f.blocks, { type, emo: '', text: '' } as Block] }));

  const patchBlock = (i: number, p: Partial<Block>) =>
    setForm((f) => ({
      ...f,
      blocks: f.blocks.map((b, k) => (k === i ? { ...b, ...p } : b)),
    }));

  const deleteBlock = (i: number) =>
    setForm((f) => ({ ...f, blocks: f.blocks.filter((_, k) => k !== i) }));

  const moveBlock = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.blocks.length) return f;
      const blocks = [...f.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...f, blocks };
    });

  const addQuiz = () => setForm((f) => ({ ...f, quizzes: [...f.quizzes, emptyQuiz()] }));
  const patchQuiz = (i: number, p: Partial<Quiz>) =>
    setForm((f) => ({ ...f, quizzes: f.quizzes.map((q, k) => (k === i ? { ...q, ...p } : q)) }));
  const deleteQuiz = (i: number) =>
    setForm((f) => ({ ...f, quizzes: f.quizzes.filter((_, k) => k !== i) }));

  const onNewTrack = async () => {
    const name = window.prompt('New module name (without emoji):');
    if (!name?.trim()) return;
    const emoji = window.prompt('Emoji for the module:', '📚') || '📚';
    const id = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
    const track = await saveTrack({
      id,
      emoji,
      nameFr: name.trim(),
      level: form.level,
      sortOrder: tracks.length,
    });
    if (track) patch({ trackId: track.id });
  };

  const onSave = async () => {
    if (!form.name.trim()) {
      toast('Lesson title is required.', 'error');
      return;
    }
    const id = form.id || newLessonId(form.level, lessons);
    setBusy(true);
    const ok = await saveLesson({ ...form, id });
    setBusy(false);
    if (ok) close();
  };

  const trackOptions = tracks.filter(
    // Show all tracks; the level grouping is loose in the legacy too.
    () => true
  );

  return (
    <Drawer
      open={open}
      onClose={close}
      width="min(760px, 100vw)"
      title={isEdit ? `Edit lesson · ${form.id}` : 'New lesson'}
      subtitle="Fill in the fields, then save to the corpus"
      actions={
        <button className="btn primary" onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className={styles.formGrid}>
        <Field label="Level">
          <select
            className="app-select"
            value={form.level}
            onChange={(e) => patch({ level: e.target.value as Lesson['level'] })}
          >
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Module / Track">
          <select
            className="app-select"
            value={form.trackId ?? ''}
            onChange={(e) => {
              if (e.target.value === '__new__') void onNewTrack();
              else patch({ trackId: e.target.value || null });
            }}
          >
            <option value="">— None —</option>
            {trackOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.nameFr}
              </option>
            ))}
            <option value="__new__">+ New module…</option>
          </select>
        </Field>

        <Field label="Emoji">
          <input
            className="app-input"
            value={form.emoji}
            maxLength={4}
            onChange={(e) => patch({ emoji: e.target.value })}
          />
        </Field>

        <Field label="Tag">
          <select
            className="app-select"
            value={form.tag}
            onChange={(e) => patch({ tag: e.target.value })}
          >
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Lesson title" full>
          <input
            className="app-input"
            value={form.name}
            placeholder="Ex: Compound interest: the wealth machine"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>

        <Field label="Duration">
          <select
            className="app-select"
            value={form.duration}
            onChange={(e) => patch({ duration: e.target.value })}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Coins">
          <select
            className="app-select"
            value={form.coins}
            onChange={(e) => patch({ coins: Number(e.target.value) })}
          >
            {COIN_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="XP">
          <input
            className="app-input"
            type="number"
            value={form.xp}
            onChange={(e) => patch({ xp: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Status">
          <select
            className="app-select"
            value={form.status}
            onChange={(e) => patch({ status: e.target.value as Lesson['status'] })}
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </Field>
      </div>

      {/* Blocks */}
      <div className={styles.section}>
        <div className="export-title">Content blocks</div>
        {form.blocks.map((b, i) => (
          <BlockEditor
            key={i}
            block={b}
            index={i}
            onChange={(p) => patchBlock(i, p)}
            onDelete={() => deleteBlock(i)}
            onMove={(dir) => moveBlock(i, dir)}
            canMoveUp={i > 0}
            canMoveDown={i < form.blocks.length - 1}
          />
        ))}
        <div className="btn-row" style={{ marginTop: '0.4rem' }}>
          <button className="btn" onClick={() => addBlock('hook')}>
            + Hook
          </button>
          <button className="btn" onClick={() => addBlock('content')}>
            + Content
          </button>
          <button className="btn" onClick={() => addBlock('tip')}>
            + Tip
          </button>
          <button className="btn" onClick={() => addBlock('trap')}>
            + Trap
          </button>
        </div>
      </div>

      {/* Quizzes */}
      <div className={styles.section}>
        <div className="export-title">Quizzes</div>
        {form.quizzes.map((q, i) => (
          <QuizEditor
            key={i}
            quiz={q}
            index={i}
            onChange={(p) => patchQuiz(i, p)}
            onDelete={() => deleteQuiz(i)}
          />
        ))}
        <button className="btn" style={{ width: '100%' }} onClick={addQuiz}>
          + Add a quiz
        </button>
      </div>
    </Drawer>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.field} ${full ? styles.full : ''}`}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
