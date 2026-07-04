import { useEffect, useMemo, useRef, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import {
  fetchResources,
  upsertResource,
  deleteResource,
  uploadResourceFile,
  corpusErrorMessage,
} from '@/lib/corpus';
import { aiSyllabusLessons, type LessonIdea } from '@/lib/ai';
import { SYLLABUS_TOTALS } from '@/lib/syllabus';
import { slugify } from '@/lib/slug';
import {
  RESOURCE_KINDS,
  type Domain,
  type Resource,
  type ResourceKind,
  type Track,
} from '@/lib/types';
import { toast } from '@/components/Toast';
import Loader from '@/components/Loader';
import Modal from '@/components/Modal';
import styles from './ContentView.module.css';

const KIND_ICON: Record<ResourceKind, string> = {
  pdf: '📄',
  youtube: '▶️',
  link: '🔗',
  image: '🖼️',
  audio: '🎧',
  article: '📰',
  idea: '💡',
  syllabus: '📚',
};

const SYLLABUS_NOTES_KEY = 'tactic.syllabus.notes';

function kindFromFile(file: File): ResourceKind {
  const t = file.type;
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  return 'link';
}

type Section = 'library' | 'syllabus' | 'modules' | 'domains';

export default function ContentView() {
  const loaded = useCorpus((s) => s.loaded);
  const loading = useCorpus((s) => s.loading);
  const load = useCorpus((s) => s.load);
  const tracks = useCorpus((s) => s.tracks);
  const lessons = useCorpus((s) => s.lessons);
  const domains = useCorpus((s) => s.domains);
  const saveTrack = useCorpus((s) => s.saveTrack);
  const deleteTrack = useCorpus((s) => s.deleteTrack);
  const saveDomain = useCorpus((s) => s.saveDomain);
  const deleteDomain = useCorpus((s) => s.deleteDomain);
  const importSyllabus = useCorpus((s) => s.importSyllabus);

  const [section, setSection] = useState<Section>('library');
  const [resources, setResources] = useState<Resource[]>([]);
  const [resLoading, setResLoading] = useState(true);

  useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);

  useEffect(() => {
    fetchResources()
      .then(setResources)
      .catch((e) => toast(corpusErrorMessage(e), 'error'))
      .finally(() => setResLoading(false));
  }, []);

  const syllabus = resources.find((r) => r.kind === 'syllabus') ?? null;
  const libraryItems = resources.filter((r) => r.kind !== 'syllabus');

  const addResource = async (r: Omit<Resource, 'id' | 'createdAt'>) => {
    try {
      const saved = await upsertResource(r);
      setResources((list) => [saved, ...list.filter((x) => x.id !== saved.id)]);
      return true;
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
      return false;
    }
  };

  const removeResource = async (id: string) => {
    try {
      await deleteResource(id);
      setResources((list) => list.filter((x) => x.id !== id));
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
    }
  };

  const setSyllabus = async (title: string, url: string) => {
    if (syllabus) await removeResource(syllabus.id);
    const ok = await addResource({ kind: 'syllabus', title, url });
    if (ok) toast('Syllabus saved', 'success');
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Content</h1>
        <p className={styles.sub}>
          Manage the syllabus, resources, domains, and modules — the Domain → Module → Lesson
          hierarchy.
        </p>
      </div>

      <div className={styles.subtabs}>
        {(
          [
            ['library', `Resource library${libraryItems.length ? ` (${libraryItems.length})` : ''}`],
            ['syllabus', 'Syllabus'],
            ['domains', `Domains${domains.length ? ` (${domains.length})` : ''}`],
            ['modules', `Modules${tracks.length ? ` (${tracks.length})` : ''}`],
          ] as [Section, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.subtab} ${section === id ? styles.subtabActive : ''}`}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'syllabus' ? (
        <SyllabusPanel
          syllabus={syllabus}
          onSave={setSyllabus}
          onRemove={removeResource}
          onImportFull={importSyllabus}
          existing={lessons.map((l) => l.name)}
        />
      ) : section === 'library' ? (
        <LibraryPanel
          loading={resLoading}
          items={libraryItems}
          tracks={tracks}
          lessons={lessons.map((l) => ({ id: l.id, name: l.name }))}
          onAdd={addResource}
          onRemove={removeResource}
        />
      ) : section === 'domains' ? (
        <DomainsPanel domains={domains} onSave={saveDomain} onDelete={deleteDomain} />
      ) : (
        <ModulesPanel
          tracks={tracks}
          domains={domains}
          onSave={saveTrack}
          onDelete={deleteTrack}
        />
      )}
    </div>
  );
}

// ─── Syllabus + generate / import ──────────────────────────────────────────

function SyllabusPanel({
  syllabus,
  onSave,
  onRemove,
  onImportFull,
  existing,
}: {
  syllabus: Resource | null;
  onSave: (title: string, url: string) => void;
  onRemove: (id: string) => void;
  onImportFull: () => Promise<boolean>;
  existing: string[];
}) {
  const openEditor = useCorpus((s) => s.openEditor);
  const [title, setTitle] = useState(syllabus?.title ?? 'Course syllabus');
  const [url, setUrl] = useState(syllabus?.url ?? '');
  const [notes, setNotes] = useState<string>(() => localStorage.getItem(SYLLABUS_NOTES_KEY) ?? '');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [ideas, setIdeas] = useState<LessonIdea[]>([]);

  const saveNotes = (v: string) => {
    setNotes(v);
    localStorage.setItem(SYLLABUS_NOTES_KEY, v);
  };

  const generate = async () => {
    const text = notes.trim();
    if (!text) {
      toast('Paste the syllabus content (or notes) below first.', 'error');
      return;
    }
    setBusy(true);
    const res = await aiSyllabusLessons({ level: 'Intermédiaire', syllabus: text, existing });
    setBusy(false);
    if (!res.ok) {
      toast(`Generation failed: ${res.error}`, 'error');
      return;
    }
    setIdeas(res.data.ideas ?? []);
    toast(`${res.data.ideas?.length ?? 0} lessons drafted — edit & save each.`, 'success');
  };

  const runImport = async () => {
    setImporting(true);
    await onImportFull();
    setImporting(false);
    setConfirmImport(false);
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
      level: 'Débutant',
      summary: idea.summary,
      blocks: [],
      quizzes: [{ q: '', opts: ['', '', '', ''], correct: 0, expl: '' }],
      translations: {},
      status: 'draft',
    });
    toast('Editor opened — refine, AI-generate the body, then save.', 'info');
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>General syllabus</div>
      <p className={styles.panelHint}>
        Import the complete TACTIC syllabus to scaffold the whole corpus
        ({SYLLABUS_TOTALS.domains} domains, {SYLLABUS_TOTALS.modules} modules,{' '}
        {SYLLABUS_TOTALS.lessons} lessons), or paste syllabus text to generate lessons with AI.
      </p>

      {/* Import full syllabus */}
      <div className={styles.importBox}>
        <div>
          <div className={styles.importTitle}>📚 Import full syllabus (A–H)</div>
          <div className={styles.importSub}>
            Creates the Domain → Module → Lesson structure. Lessons import as drafts (titles only);
            existing items are not overwritten.
          </div>
        </div>
        <button className={styles.primaryBtn} disabled={importing} onClick={() => setConfirmImport(true)}>
          {importing ? 'Importing…' : 'Import syllabus'}
        </button>
      </div>

      {/* Link the PDF */}
      <div className={styles.formRow} style={{ marginTop: '1.2rem' }}>
        <label className={styles.field}>
          Title
          <input className="app-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={styles.fieldGrow}>
          Syllabus URL (PDF or link)
          <input
            className="app-input"
            value={url}
            placeholder="https://…/syllabus.pdf"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button
          className={styles.primaryBtn}
          disabled={!url.trim()}
          onClick={() => onSave(title.trim() || 'Course syllabus', url.trim())}
        >
          {syllabus ? 'Update' : 'Load'}
        </button>
      </div>

      {syllabus ? (
        <div className={styles.syllabusActive}>
          <span>
            📚 <strong>{syllabus.title}</strong>
          </span>
          <a className={styles.linkBtn} href={syllabus.url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
          <button className={styles.dangerLink} onClick={() => onRemove(syllabus.id)}>
            Remove
          </button>
        </div>
      ) : null}

      {/* AI generation from pasted text */}
      <label className={styles.field} style={{ marginTop: '1.2rem' }}>
        Syllabus content / annotations (saved locally)
        <textarea
          className="app-input"
          rows={6}
          value={notes}
          placeholder="Paste a syllabus outline here — chapters, topics, learning objectives…"
          onChange={(e) => saveNotes(e.target.value)}
        />
      </label>
      <div className={styles.genRow}>
        <button className={styles.primaryBtn} disabled={busy} onClick={() => void generate()}>
          {busy ? 'Generating…' : '✨ Generate lessons from text'}
        </button>
      </div>

      {busy ? <Loader label="Drafting lessons…" /> : null}

      {ideas.length > 0 && !busy ? (
        <div className={styles.ideaGrid}>
          {ideas.map((i, k) => (
            <div key={k} className={styles.ideaCard}>
              <div className={styles.ideaHead}>
                <span>{i.emoji}</span>
                <span className={styles.ideaTag}>{i.tag}</span>
              </div>
              <div className={styles.ideaName}>{i.name}</div>
              {i.summary ? <div className={styles.ideaSummary}>{i.summary}</div> : null}
              <button className={styles.useBtn} onClick={() => useIdea(i)}>
                Edit &amp; save →
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <Modal open={confirmImport} onClose={() => setConfirmImport(false)} title="Import full syllabus?">
        <p className={styles.panelHint}>
          This creates {SYLLABUS_TOTALS.domains} domains, {SYLLABUS_TOTALS.modules} modules, and{' '}
          {SYLLABUS_TOTALS.lessons} draft lessons. Existing items with the same id are left
          untouched.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setConfirmImport(false)}>
            Cancel
          </button>
          <button className="btn primary" disabled={importing} onClick={() => void runImport()}>
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Resource library (with file upload) ───────────────────────────────────

function LibraryPanel({
  loading,
  items,
  tracks,
  lessons,
  onAdd,
  onRemove,
}: {
  loading: boolean;
  items: Resource[];
  tracks: Track[];
  lessons: { id: string; name: string }[];
  onAdd: (r: Omit<Resource, 'id' | 'createdAt'>) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [kindFilter, setKindFilter] = useState<ResourceKind | ''>('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{
    kind: ResourceKind;
    title: string;
    url: string;
    trackId: string;
  }>({ kind: 'link', title: '', url: '', trackId: '' });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (kindFilter && r.kind !== kindFilter) return false;
      if (q && !`${r.title} ${r.url}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, kindFilter, search]);

  const submit = async () => {
    if (!draft.title.trim() || !draft.url.trim()) {
      toast('Title and URL are required.', 'error');
      return;
    }
    const ok = await onAdd({
      kind: draft.kind,
      title: draft.title.trim(),
      url: draft.url.trim(),
      trackId: draft.trackId || null,
    });
    if (ok) {
      setDraft({ kind: 'link', title: '', url: '', trackId: '' });
      toast('Resource added', 'success');
    }
  };

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadResourceFile(file);
      await onAdd({ kind: kindFromFile(file), title: file.name, url, trackId: null });
      toast('File uploaded', 'success');
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Resource library</div>
      <p className={styles.panelHint}>
        Add resources by URL or upload files directly from your computer (PDF, image, audio). Filter
        by type or link them to a module.
      </p>

      <div className={styles.addForm}>
        <select
          className="app-select"
          value={draft.kind}
          onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as ResourceKind }))}
        >
          {RESOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_ICON[k]} {k}
            </option>
          ))}
        </select>
        <input
          className="app-input"
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <input
          className="app-input"
          placeholder="URL"
          value={draft.url}
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
        />
        <select
          className="app-select"
          value={draft.trackId}
          onChange={(e) => setDraft((d) => ({ ...d, trackId: e.target.value }))}
        >
          <option value="">— Module —</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.nameFr}
            </option>
          ))}
        </select>
        <button className={styles.primaryBtn} onClick={() => void submit()}>
          + Add
        </button>
      </div>

      {/* Upload from computer */}
      <div className={styles.uploadRow}>
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <button
          className={styles.ghostBtn}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Uploading…' : '💾 Import from computer'}
        </button>
        <span className={styles.uploadHint}>PDF, image, or audio — stored in Supabase Storage.</span>
      </div>

      <div className={styles.libFilters}>
        <button
          className={`${styles.chip} ${kindFilter === '' ? styles.chipActive : ''}`}
          onClick={() => setKindFilter('')}
        >
          All
        </button>
        {RESOURCE_KINDS.map((k) => (
          <button
            key={k}
            className={`${styles.chip} ${kindFilter === k ? styles.chipActive : ''}`}
            onClick={() => setKindFilter(k)}
          >
            {KIND_ICON[k]} {k}
          </button>
        ))}
        <input
          className="app-input"
          style={{ marginLeft: 'auto', maxWidth: 220 }}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Loader label="Loading resources…" />
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          {items.length === 0 ? 'No resources yet — add or upload one above.' : 'No matches.'}
        </div>
      ) : (
        <div className={styles.resList}>
          {filtered.map((r) => {
            const track = tracks.find((t) => t.id === r.trackId);
            const lesson = lessons.find((l) => l.id === r.lessonId);
            return (
              <div key={r.id} className={styles.resRow}>
                <span className={styles.resKind}>{KIND_ICON[r.kind] ?? '🔗'}</span>
                <div className={styles.resMain}>
                  <a className={styles.resTitle} href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <div className={styles.resSub}>
                    {r.kind}
                    {track ? ` · ${track.emoji} ${track.nameFr}` : ''}
                    {lesson ? ` · ${lesson.name}` : ''}
                  </div>
                </div>
                <button className={styles.deleteBtn} onClick={() => onRemove(r.id)}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Domains — add / edit / delete ─────────────────────────────────────────

type DomainDraft = { emoji: string; name: string; objective: string };

function DomainsPanel({
  domains,
  onSave,
  onDelete,
}: {
  domains: Domain[];
  onSave: (d: Domain) => Promise<Domain | null>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, DomainDraft>>({});
  const [adding, setAdding] = useState<DomainDraft>({ emoji: '📚', name: '', objective: '' });

  const draftFor = (d: Domain): DomainDraft =>
    edits[d.id] ?? { emoji: d.emoji, name: d.name, objective: d.objective ?? '' };

  const patch = (id: string, p: Partial<DomainDraft>) =>
    setEdits((m) => ({ ...m, [id]: { ...draftFor(domains.find((d) => d.id === id)!), ...m[id], ...p } }));

  const save = async (d: Domain) => {
    const dr = draftFor(d);
    if (!dr.name.trim()) return toast('Domain name is required.', 'error');
    const saved = await onSave({
      ...d,
      emoji: dr.emoji.trim() || '📚',
      name: dr.name.trim(),
      objective: dr.objective.trim() || undefined,
    });
    if (saved) {
      setEdits((m) => {
        const n = { ...m };
        delete n[d.id];
        return n;
      });
      toast(`Saved ${saved.name}`, 'success');
    }
  };

  const add = async () => {
    const name = adding.name.trim();
    if (!name) return toast('Domain name is required.', 'error');
    const id = `dom-${slugify(name)}`;
    if (domains.some((d) => d.id === id)) return toast('That domain already exists.', 'error');
    const saved = await onSave({
      id,
      name,
      emoji: adding.emoji.trim() || '📚',
      objective: adding.objective.trim() || undefined,
      sortOrder: domains.length,
    });
    if (saved) {
      setAdding({ emoji: '📚', name: '', objective: '' });
      toast(`Domain "${saved.name}" created`, 'success');
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Domains</div>
      <p className={styles.panelHint}>
        Domains are the top level of the corpus (Domain → Module → Lesson). Add, rename, or delete
        them. Deleting a domain detaches its modules (they aren't removed).
      </p>

      <div className={styles.domainAdd}>
        <input
          className="app-input"
          style={{ width: 60, textAlign: 'center' }}
          value={adding.emoji}
          maxLength={4}
          aria-label="Emoji"
          onChange={(e) => setAdding((a) => ({ ...a, emoji: e.target.value }))}
        />
        <input
          className="app-input"
          placeholder="New domain name"
          value={adding.name}
          onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))}
        />
        <input
          className="app-input"
          placeholder="Objective (optional)"
          value={adding.objective}
          onChange={(e) => setAdding((a) => ({ ...a, objective: e.target.value }))}
        />
        <button className={styles.primaryBtn} onClick={() => void add()}>
          + Add domain
        </button>
      </div>

      {domains.length === 0 ? (
        <div className={styles.empty}>No domains yet — add one or import the full syllabus.</div>
      ) : (
        <div className={styles.moduleList}>
          {domains.map((d) => {
            const dr = draftFor(d);
            return (
              <div key={d.id} className={styles.domainEditRow}>
                <input
                  className="app-input"
                  style={{ width: 56, textAlign: 'center' }}
                  value={dr.emoji}
                  maxLength={4}
                  onChange={(e) => patch(d.id, { emoji: e.target.value })}
                />
                <input
                  className="app-input"
                  value={dr.name}
                  onChange={(e) => patch(d.id, { name: e.target.value })}
                />
                <input
                  className="app-input"
                  placeholder="Objective"
                  value={dr.objective}
                  onChange={(e) => patch(d.id, { objective: e.target.value })}
                />
                <button className={styles.primaryBtn} onClick={() => void save(d)}>
                  Save
                </button>
                <button
                  className={styles.deleteBtn}
                  title="Delete domain"
                  onClick={() => {
                    if (window.confirm(`Delete domain "${d.name}"? Its modules will be detached.`))
                      void onDelete(d.id);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modules — add / edit / delete (with domain + core question) ───────────

type ModuleDraft = { emoji: string; nameFr: string; domainId: string; coreQuestion: string; theme: string };

function ModulesPanel({
  tracks,
  domains,
  onSave,
  onDelete,
}: {
  tracks: Track[];
  domains: Domain[];
  onSave: (t: Track) => Promise<Track | null>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, ModuleDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<ModuleDraft>({
    emoji: '📚',
    nameFr: '',
    domainId: '',
    coreQuestion: '',
    theme: '',
  });

  const draftFor = (t: Track): ModuleDraft =>
    edits[t.id] ?? {
      emoji: t.emoji,
      nameFr: t.nameFr,
      domainId: t.domainId ?? '',
      coreQuestion: t.coreQuestion ?? '',
      theme: t.theme ?? '',
    };

  const patch = (id: string, p: Partial<ModuleDraft>) =>
    setEdits((m) => ({ ...m, [id]: { ...draftFor(tracks.find((t) => t.id === id)!), ...m[id], ...p } }));

  const save = async (t: Track) => {
    const d = draftFor(t);
    if (!d.nameFr.trim()) return toast('Module name is required.', 'error');
    setSavingId(t.id);
    const saved = await onSave({
      ...t,
      emoji: d.emoji.trim() || '📚',
      nameFr: d.nameFr.trim(),
      domainId: d.domainId || null,
      coreQuestion: d.coreQuestion.trim() || undefined,
      theme: d.theme.trim() || undefined,
    });
    setSavingId(null);
    if (saved) {
      setEdits((m) => {
        const n = { ...m };
        delete n[t.id];
        return n;
      });
      toast(`Saved ${saved.nameFr}`, 'success');
    }
  };

  const add = async () => {
    const name = adding.nameFr.trim();
    if (!name) return toast('Module name is required.', 'error');
    const id = slugify(name);
    if (tracks.some((t) => t.id === id)) return toast('That module already exists.', 'error');
    const saved = await onSave({
      id,
      emoji: adding.emoji.trim() || '📚',
      nameFr: name,
      level: 'Débutant',
      sortOrder: tracks.length,
      domainId: adding.domainId || null,
      coreQuestion: adding.coreQuestion.trim() || undefined,
      theme: adding.theme.trim() || undefined,
    });
    if (saved) {
      setAdding({ emoji: '📚', nameFr: '', domainId: '', coreQuestion: '', theme: '' });
      toast(`Module "${saved.nameFr}" created`, 'success');
    }
  };

  const domainName = (id?: string | null) => domains.find((d) => d.id === id)?.name ?? '— none —';

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Modules</div>
      <p className={styles.panelHint}>
        Modules belong to a domain and carry a core question. Add, edit, or delete them. Deleting a
        module detaches its lessons (they aren't removed).
      </p>

      <div className={styles.moduleAdd}>
        <input
          className="app-input"
          style={{ width: 56, textAlign: 'center' }}
          value={adding.emoji}
          maxLength={4}
          aria-label="Emoji"
          onChange={(e) => setAdding((a) => ({ ...a, emoji: e.target.value }))}
        />
        <input
          className="app-input"
          placeholder="New module name"
          value={adding.nameFr}
          onChange={(e) => setAdding((a) => ({ ...a, nameFr: e.target.value }))}
        />
        <select
          className="app-select"
          value={adding.domainId}
          onChange={(e) => setAdding((a) => ({ ...a, domainId: e.target.value }))}
        >
          <option value="">— Domain —</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.emoji} {d.name}
            </option>
          ))}
        </select>
        <button className={styles.primaryBtn} onClick={() => void add()}>
          + Add module
        </button>
      </div>

      {tracks.length === 0 ? (
        <div className={styles.empty}>No modules yet — add one or import the full syllabus.</div>
      ) : (
        <div className={styles.moduleList}>
          {tracks.map((t) => {
            const d = draftFor(t);
            return (
              <div key={t.id} className={styles.moduleEditRow}>
                <div className={styles.moduleTop}>
                  <input
                    className="app-input"
                    style={{ width: 52, textAlign: 'center' }}
                    value={d.emoji}
                    maxLength={4}
                    onChange={(e) => patch(t.id, { emoji: e.target.value })}
                  />
                  <input
                    className="app-input"
                    value={d.nameFr}
                    onChange={(e) => patch(t.id, { nameFr: e.target.value })}
                  />
                  <select
                    className="app-select"
                    value={d.domainId}
                    title={domainName(d.domainId)}
                    onChange={(e) => patch(t.id, { domainId: e.target.value })}
                  >
                    <option value="">— Domain —</option>
                    {domains.map((dm) => (
                      <option key={dm.id} value={dm.id}>
                        {dm.emoji} {dm.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.primaryBtn}
                    disabled={savingId === t.id}
                    onClick={() => void save(t)}
                  >
                    {savingId === t.id ? '…' : 'Save'}
                  </button>
                  <button
                    className={styles.deleteBtn}
                    title="Delete module"
                    onClick={() => {
                      if (window.confirm(`Delete module "${t.nameFr}"? Its lessons will be detached.`))
                        void onDelete(t.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <input
                  className="app-input"
                  placeholder="Core question"
                  value={d.coreQuestion}
                  onChange={(e) => patch(t.id, { coreQuestion: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
