/**
 * Corpus store (zustand). Holds tracks + lessons + filters + editor/preview
 * UI state. Async actions delegate to lib/corpus.ts; views never touch
 * Supabase directly.
 */

import { create } from 'zustand';
import * as api from '@/lib/corpus';
import { corpusErrorMessage } from '@/lib/corpus';
import { toast } from '@/components/Toast';
import type { Lesson, Level, Track } from '@/lib/types';

type CorpusState = {
  tracks: Track[];
  lessons: Lesson[];
  loading: boolean;
  loaded: boolean;

  // Filters
  levelFilter: Level | null;
  trackFilter: string | null;
  search: string;

  // Editor / preview UI
  editorOpen: boolean;
  editingLesson: Lesson | null; // null while creating
  previewLesson: Lesson | null;

  // Actions
  load: () => Promise<void>;
  setLevelFilter: (lv: Level | null) => void;
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

  // Derived
  visibleLessons: () => Lesson[];
  trackById: (id: string | null) => Track | undefined;
};

export const useCorpus = create<CorpusState>((set, get) => ({
  tracks: [],
  lessons: [],
  loading: false,
  loaded: false,

  levelFilter: null,
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
      set({ tracks, lessons, loaded: true });
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    } finally {
      set({ loading: false });
    }
  },

  setLevelFilter: (lv) => set({ levelFilter: lv, trackFilter: null }),
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

  visibleLessons: () => {
    const { lessons, levelFilter, trackFilter, search } = get();
    const q = search.trim().toLowerCase();
    return lessons.filter((l) => {
      if (levelFilter && l.level !== levelFilter) return false;
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
