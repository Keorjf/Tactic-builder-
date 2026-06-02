import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCorpus } from '@/store/corpus';
import { LEVELS, type Level, type Lesson } from '@/lib/types';
import LessonCard from '@/components/LessonCard';
import Loader from '@/components/Loader';
import Modal from '@/components/Modal';
import LessonEditorDrawer from './LessonEditorDrawer';
import PreviewDrawer from './PreviewDrawer';
import styles from './ExploreView.module.css';

export default function ExploreView() {
  const {
    loading,
    loaded,
    lessons,
    tracks,
    levelFilter,
    trackFilter,
    search,
    load,
    setLevelFilter,
    setTrackFilter,
    setSearch,
    openEditor,
    openPreview,
    deleteLesson,
    duplicateLesson,
    visibleLessons,
  } = useCorpus();

  const [pendingDelete, setPendingDelete] = useState<Lesson | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const visible = visibleLessons();

  // Tracks present at the current level filter, with lesson counts.
  const tracksWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lessons) {
      if (levelFilter && l.level !== levelFilter) continue;
      if (l.trackId) counts.set(l.trackId, (counts.get(l.trackId) ?? 0) + 1);
    }
    return tracks
      .map((t) => ({ track: t, count: counts.get(t.id) ?? 0 }))
      .filter((x) => x.count > 0 || !levelFilter)
      .sort((a, b) => a.track.sortOrder - b.track.sortOrder);
  }, [tracks, lessons, levelFilter]);

  const levelCount = (lv: Level) => lessons.filter((l) => l.level === lv).length;

  if (loading && !loaded) return <Loader label="Loading corpus…" />;

  return (
    <div className={styles.wrap}>
      {/* Header row */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Explore Lessons</h1>
          <p className={styles.sub}>
            {lessons.length} lessons · {tracks.length} modules
          </p>
        </div>
        <button className="btn primary" onClick={() => openEditor()}>
          + New lesson
        </button>
      </div>

      {/* Level filter */}
      <div className={styles.levels}>
        <Chip active={!levelFilter} onClick={() => setLevelFilter(null)}>
          All <span className={styles.count}>{lessons.length}</span>
        </Chip>
        {LEVELS.map((lv) => (
          <Chip key={lv} active={levelFilter === lv} onClick={() => setLevelFilter(lv)}>
            {lv} <span className={styles.count}>{levelCount(lv)}</span>
          </Chip>
        ))}
      </div>

      <div className={styles.body}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <button
            className={`${styles.trackBtn} ${!trackFilter ? styles.trackActive : ''}`}
            onClick={() => setTrackFilter(null)}
          >
            <span>All modules</span>
            <span className={styles.trackCount}>{visible.length}</span>
          </button>
          {tracksWithCounts.map(({ track, count }) => (
            <button
              key={track.id}
              className={`${styles.trackBtn} ${
                trackFilter === track.id ? styles.trackActive : ''
              }`}
              onClick={() => setTrackFilter(track.id)}
            >
              <span className={styles.trackName}>
                {track.emoji} {track.nameFr}
              </span>
              <span className={styles.trackCount}>{count}</span>
            </button>
          ))}
        </aside>

        {/* Lesson list */}
        <section className={styles.list}>
          <input
            className="app-input"
            placeholder="Search by title, id or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: '0.8rem' }}
          />

          {visible.length === 0 ? (
            <div className={styles.empty}>
              {lessons.length === 0 ? (
                <>
                  <div className={styles.emptyTitle}>The corpus is empty.</div>
                  <div className={styles.emptySub}>
                    Create a lesson, or{' '}
                    <Link to="/export" className={styles.link}>
                      import the starter corpus
                    </Link>{' '}
                    from the Export tab.
                  </div>
                </>
              ) : (
                <div className={styles.emptyTitle}>No lessons match this filter.</div>
              )}
            </div>
          ) : (
            <div className={styles.cards}>
              {visible.map((l) => (
                <LessonCard
                  key={l.id}
                  lesson={l}
                  onPreview={() => openPreview(l)}
                  onEdit={() => openEditor(l)}
                  onDuplicate={() => void duplicateLesson(l.id)}
                  onDelete={() => setPendingDelete(l)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Delete confirm */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete lesson?"
      >
        <p className={styles.confirmBody}>
          Permanently delete <strong>{pendingDelete?.name}</strong> (
          {pendingDelete?.id})? This can't be undone.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (pendingDelete) void deleteLesson(pendingDelete.id);
              setPendingDelete(null);
            }}
          >
            Delete
          </button>
        </div>
      </Modal>

      <LessonEditorDrawer />
      <PreviewDrawer />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`${styles.chip} ${active ? styles.chipActive : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
