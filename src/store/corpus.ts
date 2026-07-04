/**
 * Corpus store (zustand). Holds tracks + lessons + filters + editor/preview
 * UI state. Async actions delegate to lib/corpus.ts; views never touch
 * Supabase directly.
 */

import { create } from 'zustand';
import * as api from '@/lib/corpus';
import { corpusErrorMessage } from '@/lib/corpus';
import { toast } from '@/components/Toast';
import { SYLLABUS, domainId, moduleId, lessonId } from '@/lib/syllabus';
import type { Domain, Lesson, Level, Track } from '@/lib/types';

type CorpusState = {
  tracks: Track[];
  lessons: Lesson[];
  domains: Domain[];
  loading: boolean;
  loaded: boolean;

  // Filters
  domainFilter: string | null; // domain id
  trackFilter: string | null;
  search: string;

  // Editor / preview UI
  editorOpen: boolean;
  editingLesson: Lesson | null; // null while creating
  previewLesson: Lesson | null;

  // Actions
  load: () => Promise<void>;
  setDomainFilter: (id: string | null) => void;
  setTrackFilter: (id: string | null) => void;
  setSearch: (s: string) => void;

  openEditor: (lesson?: Lesson | null) => void;
  closeEditor: () => void;
  openPreview: (lesson: Lesson) => void;
  closePreview: () => void;

  saveLesson: (lesson: Lesson) => Promise<boolean>;
  deleteLesson: (id: string) => Promise<void>;
  duplicateLesson: (id: string) => Promise<void>;
  saveTrack: (track: Track) => Promise<Track | null>;
  deleteTrack: (id: string) => Promise<void>;
  renameDomain: (oldTag: string, newTag: string) => Promise<void>;
  saveDomain: (domain: Domain) => Promise<Domain | null>;
  deleteDomain: (id: string) => Promise<void>;
  importSeed: (tracks: Track[], lessons: Lesson[]) => Promise<boolean>;
  importSyllabus: () => Promise<boolean>;

  // Derived
  visibleLessons: () => Lesson[];
  trackById: (id: string | null) => Track | undefined;
};

export const useCorpus = create<CorpusState>((set, get) => ({
  tracks: [],
  lessons: [],
  domains: [],
  loading: false,
  loaded: false,

  domainFilter: null,
  trackFilter: null,
  search: '',

  editorOpen: false,
  editingLesson: null,
  previewLesson: null,

  load: async () => {
    set({ loading: true });
    try {
      const [tracks, lessons] = await Promise.all([
        api.fetchTracks(),
        api.fetchLessons(),
      ]);
      // Domains are best-effort — if the 0006 migration isn't applied yet,
      // the rest of the corpus still loads.
      const domains = await api.fetchDomains().catch(() => [] as Domain[]);
      set({ tracks, lessons, domains, loaded: true });
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    } finally {
      set({ loading: false });
    }
  },

  setDomainFilter: (id) => set({ domainFilter: id, trackFilter: null }),
  setTrackFilter: (id) => set({ trackFilter: id }),
  setSearch: (s) => set({ search: s }),

  openEditor: (lesson = null) => set({ editorOpen: true, editingLesson: lesson }),
  closeEditor: () => set({ editorOpen: false, editingLesson: null }),
  openPreview: (lesson) => set({ previewLesson: lesson }),
  closePreview: () => set({ previewLesson: null }),

  saveLesson: async (lesson) => {
    try {
      const saved = await api.upsertLesson(lesson);
      set((s) => {
        const exists = s.lessons.some((l) => l.id === saved.id);
        return {
          lessons: exists
            ? s.lessons.map((l) => (l.id === saved.id ? saved : l))
            : [...s.lessons, saved],
        };
      });
      toast(`Saved "${saved.name}"`, 'success');
      return true;
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
      return false;
    }
  },

  deleteLesson: async (id) => {
    try {
      await api.deleteLesson(id);
      set((s) => ({ lessons: s.lessons.filter((l) => l.id !== id) }));
      toast('Lesson deleted', 'info');
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    }
  },

  duplicateLesson: async (id) => {
    const src = get().lessons.find((l) => l.id === id);
    if (!src) return;
    const newId = nextLessonId(src.id, get().lessons);
    const copy: Lesson = {
      ...src,
      id: newId,
      name: `${src.name} (copy)`,
      status: 'draft',
      blocks: src.blocks.map((b) => ({ ...b })),
      quizzes: src.quizzes.map((q) => ({ ...q, opts: [...q.opts] })),
      translations: { ...src.translations },
    };
    const ok = await get().saveLesson(copy);
    if (ok) get().openEditor(copy);
  },

  saveTrack: async (track) => {
    try {
      const saved = await api.upsertTrack(track);
      set((s) => {
        const exists = s.tracks.some((t) => t.id === saved.id);
        return {
          tracks: exists
            ? s.tracks.map((t) => (t.id === saved.id ? saved : t))
            : [...s.tracks, saved].sort((a, b) => a.sortOrder - b.sortOrder),
        };
      });
      return saved;
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
      return null;
    }
  },

  deleteTrack: async (id) => {
    try {
      await api.deleteTrack(id);
      set((s) => ({
        tracks: s.tracks.filter((t) => t.id !== id),
        // Detach lessons that pointed at the removed track.
        lessons: s.lessons.map((l) => (l.trackId === id ? { ...l, trackId: null } : l)),
        trackFilter: s.trackFilter === id ? null : s.trackFilter,
      }));
      toast('Module deleted', 'info');
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    }
  },

  renameDomain: async (oldTag, newTag) => {
    const next = newTag.trim();
    if (!next || next === oldTag) return;
    try {
      await api.renameTag(oldTag, next);
      set((s) => ({
        lessons: s.lessons.map((l) => (l.tag === oldTag ? { ...l, tag: next } : l)),
      }));
      toast(`Domain "${oldTag}" → "${next}"`, 'success');
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    }
  },

  saveDomain: async (domain) => {
    try {
      const saved = await api.upsertDomain(domain);
      set((s) => {
        const exists = s.domains.some((d) => d.id === saved.id);
        return {
          domains: (exists
            ? s.domains.map((d) => (d.id === saved.id ? saved : d))
            : [...s.domains, saved]
          ).sort((a, b) => a.sortOrder - b.sortOrder),
        };
      });
      return saved;
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
      return null;
    }
  },

  deleteDomain: async (id) => {
    try {
      await api.deleteDomain(id);
      set((s) => ({
        domains: s.domains.filter((d) => d.id !== id),
        tracks: s.tracks.map((t) => (t.domainId === id ? { ...t, domainId: null } : t)),
      }));
      toast('Domain deleted', 'info');
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    }
  },

  importSeed: async (tracks, lessons) => {
    try {
      await api.insertTracks(tracks);
      const n = await api.insertLessons(lessons);
      await get().load();
      toast(`Imported ${n} lessons + ${tracks.length} modules`, 'success');
      return true;
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
      return false;
    }
  },

  importSyllabus: async () => {
    try {
      const domains: Domain[] = SYLLABUS.map((d, i) => ({
        id: domainId(d.code),
        code: d.code,
        name: `Domain ${d.code} - ${d.name}`,
        emoji: d.emoji,
        objective: d.objective,
        sortOrder: i,
      }));
      const tracks: Track[] = [];
      const lessons: Lesson[] = [];
      SYLLABUS.forEach((d, di) => {
        d.modules.forEach((m, mi) => {
          const tid = moduleId(d.code, mi);
          tracks.push({
            id: tid,
            emoji: d.emoji,
            nameFr: m.title,
            level: 'Débutant',
            sortOrder: di * 100 + mi,
            domainId: domainId(d.code),
            coreQuestion: m.coreQuestion,
          });
          m.lessons.forEach((name, li) => {
            lessons.push({
              id: lessonId(d.code, mi, li),
              trackId: tid,
              emoji: '📖',
              name,
              duration: '1 min',
              coins: 80,
              xp: 60,
              tag: `Domain ${d.code}`,
              level: 'Débutant',
              blocks: [],
              quizzes: [],
              translations: {},
              status: 'draft',
            });
          });
        });
      });
      await api.insertDomains(domains);
      await api.insertTracks(tracks);
      const n = await api.insertLessons(lessons);
      await get().load();
      toast(
        `Imported ${domains.length} domains, ${tracks.length} modules, ${n} lessons`,
        'success'
      );
      return true;
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
      return false;
    }
  },

  visibleLessons: () => {
    const { lessons, tracks, domainFilter, trackFilter, search } = get();
    const q = search.trim().toLowerCase();
    const trackDomain = new Map(tracks.map((t) => [t.id, t.domainId ?? null]));
    return lessons.filter((l) => {
      if (domainFilter && trackDomain.get(l.trackId ?? '') !== domainFilter) return false;
      if (trackFilter && l.trackId !== trackFilter) return false;
      if (q && !`${l.name} ${l.id} ${l.tag}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  },

  trackById: (id) => get().tracks.find((t) => t.id === id),
}));

// ─── ID helpers ────────────────────────────────────────────────────────────

/** Generate the next free id by reusing the source's alpha prefix. */
export function nextLessonId(seed: string, existing: Lesson[]): string {
  const prefix = (seed.match(/^[a-z]+/i)?.[0] ?? 'n').toLowerCase();
  const taken = new Set(existing.map((l) => l.id));
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Generate a fresh id for a brand-new lesson in a given level bucket. */
export function newLessonId(level: Level, existing: Lesson[]): string {
  const prefix =
    level === 'Débutant'
      ? 'nx'
      : level === 'Intermédiaire'
      ? 'ny'
      : level === 'Avancé'
      ? 'nz'
      : 'ne';
  const taken = new Set(existing.map((l) => l.id));
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
