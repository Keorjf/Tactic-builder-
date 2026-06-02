import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { SEED_LESSONS, SEED_TRACKS } from '@/lib/seed';
import { lessonToMobile } from '@/lib/mappers';
import { toast } from '@/components/Toast';
import Modal from '@/components/Modal';
import styles from './ExportView.module.css';

export default function ExportView() {
  const { loaded, load, lessons, tracks, importSeed } = useCorpus();
  const [confirmImport, setConfirmImport] = useState(false);
  const [busy, setBusy] = useState(false);

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
