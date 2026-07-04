import { useEffect, useMemo, useRef, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { SEED_LESSONS, SEED_TRACKS } from '@/lib/seed';
import { lessonToMobile } from '@/lib/mappers';
import { LEVELS, type Block, type Lesson, type Level, type Quiz, type Track } from '@/lib/types';
import { toast } from '@/components/Toast';
import Modal from '@/components/Modal';
import styles from './ExportView.module.css';

function asLevel(v: unknown): Level {
  return LEVELS.includes(v as Level) ? (v as Level) : 'Débutant';
}

/** Normalize an arbitrary imported payload into admin Track[]/Lesson[].
 *  Accepts both this app's export (mobile shape) and admin-shaped lessons. */
function normalizeImport(raw: unknown): { tracks: Track[]; lessons: Lesson[] } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawTracks = Array.isArray(obj.tracks) ? obj.tracks : [];
  const rawLessons = Array.isArray(obj.lessons)
    ? obj.lessons
    : Array.isArray(raw)
    ? (raw as unknown[])
    : [];

  const tracks: Track[] = rawTracks.map((t, i) => {
    const r = t as Record<string, unknown>;
    return {
      id: String(r.id ?? `track-${i}`),
      emoji: String(r.emoji ?? '📚'),
      nameFr: String(r.nameFr ?? r.name ?? `Module ${i + 1}`),
      nameEn: r.nameEn ? String(r.nameEn) : undefined,
      level: asLevel(r.level),
      sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : i,
      theme: r.theme ? String(r.theme) : undefined,
    };
  });

  const lessons: Lesson[] = rawLessons.map((l, i) => {
    const r = l as Record<string, unknown>;
    const rawBlocks = Array.isArray(r.blocks) ? r.blocks : [];
    const blocks: Block[] = rawBlocks.map((b) => {
      const bb = b as Record<string, unknown>;
      return {
        type: (bb.type as Block['type']) ?? 'content',
        text: String(bb.text ?? bb.body ?? ''),
        emo: bb.emo ? String(bb.emo) : undefined,
        title: bb.title ? String(bb.title) : undefined,
      };
    });
    const quizzes: Quiz[] = Array.isArray(r.quizzes)
      ? (r.quizzes as Quiz[])
      : r.quiz
      ? [r.quiz as Quiz]
      : [];
    return {
      id: String(r.id ?? `imported-${i}`),
      trackId: (r.trackId as string) ?? null,
      emoji: String(r.emoji ?? r.e ?? '📖'),
      name: String(r.name ?? r.n ?? `Lesson ${i + 1}`),
      duration: String(r.duration ?? r.t ?? '1 min'),
      coins: typeof r.coins === 'number' ? r.coins : 80,
      xp: typeof r.xp === 'number' ? r.xp : 60,
      tag: String(r.tag ?? 'Core'),
      level: asLevel(r.level),
      summary: r.summary ? String(r.summary) : undefined,
      blocks,
      quizzes,
      translations: (r.translations as Lesson['translations']) ?? {},
      status: r.status === 'draft' ? 'draft' : 'published',
    };
  });

  return { tracks, lessons };
}

export default function ExportView() {
  const { loaded, load, lessons, tracks, importSeed } = useCorpus();
  const [confirmImport, setConfirmImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<{ tracks: Track[]; lessons: Lesson[] } | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const json = useMemo(() => {
    const payload = {
      tracks: tracks.map((t) => ({
        id: t.id,
        emoji: t.emoji,
        name: t.nameFr,
        level: t.level,
      })),
      lessons: lessons.map(lessonToMobile),
    };
    return JSON.stringify(payload, null, 2);
  }, [tracks, lessons]);

  const onImport = async () => {
    setBusy(true);
    await importSeed(SEED_TRACKS, SEED_LESSONS);
    setBusy(false);
    setConfirmImport(false);
  };

  const onFilePicked = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = normalizeImport(JSON.parse(text));
      if (parsed.lessons.length === 0 && parsed.tracks.length === 0) {
        toast('No lessons or modules found in that file.', 'error');
        return;
      }
      setPendingFile(parsed);
    } catch (e) {
      toast(`Could not read file: ${(e as Error).message}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onImportFile = async () => {
    if (!pendingFile) return;
    setBusy(true);
    await importSeed(pendingFile.tracks, pendingFile.lessons);
    setBusy(false);
    setPendingFile(null);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(json);
    toast('JSON copied to clipboard');
  };

  const downloadJson = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tactic-corpus.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Export &amp; Import</h1>

      {/* Import starter corpus */}
      <div className="export-box">
        <div className="export-title">📥 Import starter corpus</div>
        <p className={styles.desc}>
          Seed the database with the original{' '}
          <strong>{SEED_LESSONS.length} lessons</strong> across{' '}
          <strong>{SEED_TRACKS.length} modules</strong> from the legacy app.
          Lessons import as metadata (no content blocks yet) — author or
          AI-generate the content afterwards. Existing lessons with the same id
          are left untouched.
        </p>
        <button
          className="btn primary"
          onClick={() => setConfirmImport(true)}
          disabled={busy}
        >
          Import {SEED_LESSONS.length} lessons
        </button>
        {lessons.length > 0 ? (
          <span className={styles.note}>
            Corpus currently has {lessons.length} lessons.
          </span>
        ) : null}
      </div>

      {/* Import from device */}
      <div className="export-box">
        <div className="export-title">💾 Import from device</div>
        <p className={styles.desc}>
          Upload a <code>.json</code> file of lessons + modules from your computer — either this
          app's exported file or a compatible corpus dump. Existing lessons with the same id are
          left untouched.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFilePicked(f);
          }}
        />
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          Choose file…
        </button>
      </div>

      {/* Export JSON */}
      <div className="export-box">
        <div className="export-title">📤 Export corpus (JSON)</div>
        <p className={styles.desc}>
          The full corpus in the mobile app's <code>Lesson</code> shape — drop
          it into the app, or keep it as a backup. The app can also read
          published lessons straight from Supabase.
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={copyJson}>
            Copy JSON
          </button>
          <button className="btn" onClick={downloadJson}>
            Download .json
          </button>
        </div>
        <pre className={styles.code}>{json.slice(0, 2000)}{json.length > 2000 ? '\n…' : ''}</pre>
      </div>

      <Modal
        open={!!pendingFile}
        onClose={() => setPendingFile(null)}
        title="Import from file?"
      >
        <p className={styles.confirm}>
          This inserts {pendingFile?.lessons.length ?? 0} lessons +{' '}
          {pendingFile?.tracks.length ?? 0} modules from the selected file. Existing lessons with
          the same id are not overwritten.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setPendingFile(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={onImportFile} disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmImport}
        onClose={() => setConfirmImport(false)}
        title="Import starter corpus?"
      >
        <p className={styles.confirm}>
          This inserts {SEED_LESSONS.length} lessons + {SEED_TRACKS.length}{' '}
          modules into the database. Safe to run more than once — it won't
          overwrite lessons you've already edited.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setConfirmImport(false)}>
            Cancel
          </button>
          <button className="btn primary" onClick={onImport} disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
