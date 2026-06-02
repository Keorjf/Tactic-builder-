/**
 * Shared domain types for the Corpus Builder.
 *
 * These mirror the legacy admin model and stay compatible with the mobile
 * app's `Lesson`/`Block`/`Quiz` shape so the corpus can be consumed by both.
 */

// ─── Auth / roles ──────────────────────────────────────────────────────────

export type AdminRole = 'learner' | 'ux' | 'ped' | 'data' | 'admin';

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AdminRole;
};

// ─── Lesson levels / blocks / quizzes ─────────────────────────────────────

/** Stored in French to match the legacy corpus + mobile data. */
export type Level = 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert';

export const LEVELS: Level[] = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];

export type BlockType = 'hook' | 'content' | 'tip' | 'trap' | 'real' | 'info';

export type Block = {
  type: BlockType;
  /** Body text. Legacy used `text`; mobile uses `body`. We standardise on `text`
   *  in the admin and map to `body` when exporting to the app. */
  text: string;
  emo?: string;
  title?: string;
};

export type Quiz = {
  q: string;
  opts: string[];
  /** Index into `opts` of the correct answer. */
  correct: number;
  expl: string;
};

/** Per-language translation payload for a lesson. */
export type Translation = {
  title?: string;
  blocks?: Block[];
  quizzes?: Quiz[];
};

export type LessonStatus = 'draft' | 'published';

// ─── Tracks ────────────────────────────────────────────────────────────────

export type Track = {
  id: string;
  emoji: string;
  nameFr: string;
  nameEn?: string;
  level: Level;
  sortOrder: number;
};

// ─── Lessons ───────────────────────────────────────────────────────────────

export type Lesson = {
  id: string;
  trackId: string | null;
  emoji: string;
  name: string;
  duration: string;
  coins: number;
  xp: number;
  tag: string;
  level: Level;
  blocks: Block[];
  quizzes: Quiz[];
  translations: Partial<Record<'en' | 'es', Translation>>;
  status: LessonStatus;
  createdAt?: string;
  updatedAt?: string;
};

// ─── Resources ─────────────────────────────────────────────────────────────

export type ResourceKind = 'youtube' | 'pdf' | 'link';

export type Resource = {
  id: string;
  kind: ResourceKind;
  title: string;
  url: string;
  lessonId?: string | null;
  trackId?: string | null;
  createdAt?: string;
};

// ─── Tag options (from the legacy editor's <select>) ──────────────────────

export const TAGS = [
  'Core',
  'Strategy',
  'Practice',
  'Analysis',
  'Psychology',
  'Tax',
  'Vocab',
  'ETF',
  'Crypto',
  'Real Estate',
  'Macro',
  'Retirement',
  'Expert',
  'Derivatives',
  'Risk',
] as const;
