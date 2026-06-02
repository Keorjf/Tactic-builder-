/**
 * Shape conversion between the database rows, the admin-facing types, and
 * the mobile app's `Lesson` shape.
 *
 * - DB rows are snake_case.
 * - Admin types (lib/types.ts) are camelCase and what the UI works with.
 * - The mobile app expects { id, trackId, e, n, t, coins, xp, tag, blocks, quiz }
 *   with block.body (not block.text) — produced by `lessonToMobile` for export.
 */

import type {
  Block,
  Lesson,
  LessonStatus,
  Level,
  Quiz,
  Resource,
  ResourceKind,
  Track,
  Translation,
} from './types';

// ─── DB row shapes ─────────────────────────────────────────────────────────

export type TrackRow = {
  id: string;
  emoji: string;
  name_fr: string;
  name_en: string | null;
  level: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type LessonRow = {
  id: string;
  track_id: string | null;
  emoji: string;
  name: string;
  duration: string;
  coins: number;
  xp: number;
  tag: string;
  level: string;
  blocks: Block[] | null;
  quizzes: Quiz[] | null;
  translations: Partial<Record<'en' | 'es', Translation>> | null;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type ResourceRow = {
  id: string;
  kind: string;
  title: string;
  url: string;
  lesson_id: string | null;
  track_id: string | null;
  created_at?: string;
};

const LEVELS_SET = new Set(['Débutant', 'Intermédiaire', 'Avancé', 'Expert']);
function asLevel(v: string): Level {
  return (LEVELS_SET.has(v) ? v : 'Débutant') as Level;
}
function asStatus(v: string): LessonStatus {
  return v === 'draft' ? 'draft' : 'published';
}

// ─── Track ↔ row ───────────────────────────────────────────────────────────

export function rowToTrack(r: TrackRow): Track {
  return {
    id: r.id,
    emoji: r.emoji,
    nameFr: r.name_fr,
    nameEn: r.name_en ?? undefined,
    level: asLevel(r.level),
    sortOrder: r.sort_order ?? 0,
  };
}

export function trackToRow(t: Track): TrackRow {
  return {
    id: t.id,
    emoji: t.emoji,
    name_fr: t.nameFr,
    name_en: t.nameEn ?? null,
    level: t.level,
    sort_order: t.sortOrder,
  };
}

// ─── Lesson ↔ row ──────────────────────────────────────────────────────────

export function rowToLesson(r: LessonRow): Lesson {
  return {
    id: r.id,
    trackId: r.track_id,
    emoji: r.emoji,
    name: r.name,
    duration: r.duration,
    coins: r.coins,
    xp: r.xp,
    tag: r.tag,
    level: asLevel(r.level),
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
    quizzes: Array.isArray(r.quizzes) ? r.quizzes : [],
    translations: r.translations ?? {},
    status: asStatus(r.status),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** For inserts/updates — omits server-managed timestamps. */
export function lessonToRow(l: Lesson): Omit<LessonRow, 'created_at' | 'updated_at'> {
  return {
    id: l.id,
    track_id: l.trackId,
    emoji: l.emoji,
    name: l.name,
    duration: l.duration,
    coins: l.coins,
    xp: l.xp,
    tag: l.tag,
    level: l.level,
    blocks: l.blocks,
    quizzes: l.quizzes,
    translations: l.translations,
    status: l.status,
  };
}

// ─── Resource ↔ row ────────────────────────────────────────────────────────

export function rowToResource(r: ResourceRow): Resource {
  return {
    id: r.id,
    kind: (r.kind as ResourceKind) ?? 'link',
    title: r.title,
    url: r.url,
    lessonId: r.lesson_id,
    trackId: r.track_id,
    createdAt: r.created_at,
  };
}

// ─── Lesson → mobile app shape (for export, Phase 3) ──────────────────────

export type MobileLesson = {
  id: string;
  trackId: string | null;
  e: string;
  n: string;
  t: string;
  coins: number;
  xp: number;
  tag: string;
  blocks: { type: string; body: string; emo?: string; title?: string }[];
  quiz: Quiz | null;
};

export function lessonToMobile(l: Lesson): MobileLesson {
  return {
    id: l.id,
    trackId: l.trackId,
    e: l.emoji,
    n: l.name,
    t: l.duration,
    coins: l.coins,
    xp: l.xp,
    tag: l.tag,
    blocks: l.blocks.map((b) => ({
      type: b.type,
      body: b.text,
      ...(b.emo ? { emo: b.emo } : {}),
      ...(b.title ? { title: b.title } : {}),
    })),
    quiz: l.quizzes[0] ?? null,
  };
}
