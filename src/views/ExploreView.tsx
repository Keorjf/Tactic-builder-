import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCorpus } from '@/store/corpus';
import { type Lesson } from '@/lib/types';
import { slugify } from '@/lib/slug';
import LessonCard from '@/components/LessonCard';
import Loader from '@/components/Loader';
import Modal from '@/components/Modal';
import { toast } from '@/components/Toast';
import styles from './ExploreView.module.css';

type SortKey = 'module' | 'name' | 'recent';

export default function ExploreView() {
  const {
    loading,
    loaded,
    lessons,
    tracks,
    domains,
    domainFilter,
    trackFilter,
    search,
    load,
    setDomainFilter,
    setTrackFilter,
    setSearch,
    openEditor,
    openPreview,
    deleteLesson,
    duplicateLesson,
    visibleLessons,
    saveDomain,
    saveTrack,
  } = useCorpus();

  const [pendingDelete, setPendingDelete] = useState<Lesson | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('module');
  const [addDomain, setAddDomain] = useState<{ name: string; emoji: string } | null>(null);
  const [addModule, setAddModule] = useState<{ name: string; emoji: string; domainId: string } | null>(
    null
  );

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const trackDomain = useMemo(() => new Map(tracks.map((t) => [t.id, t.domainId ?? null])), [tracks]);

  // Sort the store-filtered lessons.
  const visible = useMemo(() => {
    const rows = visibleLessons();
    const order = new Map(tracks.map((t) => [t.id, t.sortOrder]));
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
          return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
        case 'module':
        default:
          return (order.get(a.trackId ?? '') ?? 999) - (order.get(b.trackId ?? '') ?? 999);
      }
    });
  }, [visibleLessons, tracks, sortKey]);

  const domainCount = (id: string) =>
    lessons.filter((l) => trackDomain.get(l.trackId ?? '') === id).length;

  // Modules shown in the sidebar — scoped to the selected domain.
  const tracksWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lessons) if (l.trackId) counts.set(l.trackId, (counts.get(l.trackId) ?? 0) + 1);
    return tracks
      .filter((t) => !domainFilter || t.domainId === domainFilter)
      .map((t) => ({ track: t, count: counts.get(t.id) ?? 0 }))
      .sort((a, b) => a.track.sortOrder - b.track.sortOrder);
  }, [tracks, lessons, domainFilter]);

  const createDomain = async () => {
    const name = addDomain?.name.trim();
    if (!name) return toast('Domain name is required.', 'error');
    const id = `dom-${slugify(name)}`;
    if (domains.some((d) => d.id === id)) return toast('That domain already exists.', 'error');
    const saved = await saveDomain({
      id,
      name,
      emoji: addDomain?.emoji.trim() || '📚',
      sortOrder: domains.length,
    });
    if (saved) {
      setAddDomain(null);
      toast(`Domain "${saved.name}" created`, 'success');
    }
  };

  const createModule = async () => {
    const name = addModule?.name.trim();
    if (!name) return toast('Module name is required.', 'error');
    const id = slugify(name);
    if (tracks.some((t) => t.id === id)) return toast('That module already exists.', 'error');
    const saved = await saveTrack({
      id,
      emoji: addModule?.emoji.trim() || '📚',
      nameFr: name,
      level: 'Débutant',
      sortOrder: tracks.length,
      domainId: addModule?.domainId || null,
    });
    if (saved) {
      setAddModule(null);
      toast(`Module "${saved.nameFr}" created`, 'success');
    }
  };

  if (loading && !loaded) return <Loader label="Loading corpus…" />;

  return (
    <div className={styles.wrap}>
      {/* Header row */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Explore Lessons</h1>
          <p className={styles.sub}>
            {lessons.length} lessons · {tracks.length} modules · {domains.length} domains
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className="btn" onClick={() => setAddDomain({ name: '', emoji: '📚' })}>
            + Add domain
          </button>
          <button
            className="btn"
            onClick={() => setAddModule({ name: '', emoji: '📚', domainId: domainFilter ?? '' })}
          >
            + Add module
          </button>
          <button className="btn primary" onClick={() => openEditor()}>
            + New lesson
          </button>
        </div>
      </div>

      {/* Domain filter (replaces level) */}
      <div className={styles.levels}>
        <Chip active={!domainFilter} onClick={() => setDomainFilter(null)}>
          All <span className={styles.count}>{lessons.length}</span>
        </Chip>
        {domains.map((d) => (
          <Chip key={d.id} active={domainFilter === d.id} onClick={() => setDomainFilter(d.id)}>
            {d.emoji} {d.name} <span className={styles.count}>{domainCount(d.id)}</span>
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
              className={`${styles.trackBtn} ${trackFilter === track.id ? styles.trackActive : ''}`}
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
          <div className={styles.controlsRow}>
            <input
              className="app-input"
              placeholder="Search by title, id or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="app-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              title="Sort lessons"
            >
              <option value="module">Sort: Module</option>
              <option value="name">Sort: Name</option>
              <option value="recent">Sort: Recently updated</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className={styles.empty}>
              {lessons.length === 0 ? (
                <>
                  <div className={styles.emptyTitle}>The corpus is empty.</div>
                  <div className={styles.emptySub}>
                    Create a lesson, or{' '}
                    <Link to="/content" className={styles.link}>
                      import the full syllabus
                    </Link>{' '}
                    from the Content tab.
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

      {/* Add domain */}
      <Modal open={!!addDomain} onClose={() => setAddDomain(null)} title="Add domain">
        <div className={styles.miniForm}>
          <input
            className="app-input"
            style={{ width: 64, textAlign: 'center' }}
            value={addDomain?.emoji ?? ''}
            maxLength={4}
            aria-label="Emoji"
            onChange={(e) => setAddDomain((d) => d && { ...d, emoji: e.target.value })}
          />
          <input
            className="app-input"
            placeholder="Domain name (e.g. Financial Survival)"
            value={addDomain?.name ?? ''}
            autoFocus
            onChange={(e) => setAddDomain((d) => d && { ...d, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && void createDomain()}
          />
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setAddDomain(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void createDomain()}>
            Add domain
          </button>
        </div>
      </Modal>

      {/* Add module */}
      <Modal open={!!addModule} onClose={() => setAddModule(null)} title="Add module">
        <div className={styles.miniForm}>
          <input
            className="app-input"
            style={{ width: 64, textAlign: 'center' }}
            value={addModule?.emoji ?? ''}
            maxLength={4}
            aria-label="Emoji"
            onChange={(e) => setAddModule((m) => m && { ...m, emoji: e.target.value })}
          />
          <input
            className="app-input"
            placeholder="Module name"
            value={addModule?.name ?? ''}
            autoFocus
            onChange={(e) => setAddModule((m) => m && { ...m, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && void createModule()}
          />
        </div>
        <select
          className="app-select"
          style={{ width: '100%', marginBottom: '0.8rem' }}
          value={addModule?.domainId ?? ''}
          onChange={(e) => setAddModule((m) => m && { ...m, domainId: e.target.value })}
        >
          <option value="">— Domain —</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.emoji} {d.name}
            </option>
          ))}
        </select>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setAddModule(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void createModule()}>
            Add module
          </button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete lesson?">
        <p className={styles.confirmBody}>
          Permanently delete <strong>{pendingDelete?.name}</strong> ({pendingDelete?.id})? This
          can't be undone.
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
