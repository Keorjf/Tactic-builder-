/**
 * Pure analytics functions that compute corpus-health and
 * content-quality numbers from the in-memory corpus state.
 *
 * Used by `StatsView`; everything here is synchronous and side-effect
 * free so it can also feed CSV exports and future agents.
 */

import { bloomLevel, flesch, pct, wordCount } from '@/lib/format';
import { LEVELS, type Lesson, type Level, type Track } from '@/lib/types';

// ─── Corpus health ─────────────────────────────────────────────────────────

export type CountByKey = { key: string; label: string; count: number };

export type CorpusHealth = {
  total: number;
  published: number;
  drafts: number;
  byLevel: CountByKey[];
  byTrack: CountByKey[];
  byTag: CountByKey[];
  trackCount: number;
  emptyTracks: number; // tracks with zero lessons
  gaps: {
    noContent: Lesson[]; // 0 blocks
    noQuiz: Lesson[]; // 0 quizzes or first quiz empty
    noTrack: Lesson[]; // trackId === null
    untranslated: { en: Lesson[]; es: Lesson[] };
  };
};

function isQuizEmpty(l: Lesson): boolean {
  if (l.quizzes.length === 0) return true;
  const q = l.quizzes[0];
  return !q.q?.trim() || q.opts.every((o) => !o?.trim());
}

export function computeCorpusHealth(lessons: Lesson[], tracks: Track[]): CorpusHealth {
  const total = lessons.length;
  const published = lessons.filter((l) => l.status === 'published').length;
  const drafts = total - published;

  const levelMap = new Map<Level, number>();
  for (const lv of LEVELS) levelMap.set(lv, 0);
  for (const l of lessons) levelMap.set(l.level, (levelMap.get(l.level) ?? 0) + 1);
  const byLevel: CountByKey[] = LEVELS.map((lv) => ({
    key: lv,
    label: lv,
    count: levelMap.get(lv) ?? 0,
  }));

  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const trackMap = new Map<string, number>();
  for (const t of tracks) trackMap.set(t.id, 0);
  for (const l of lessons) {
    if (l.trackId && trackMap.has(l.trackId)) {
      trackMap.set(l.trackId, (trackMap.get(l.trackId) ?? 0) + 1);
    }
  }
  const byTrack: CountByKey[] = tracks
    .map((t) => ({
      key: t.id,
      label: `${t.emoji} ${t.nameFr}`,
      count: trackMap.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  const emptyTracks = byTrack.filter((t) => t.count === 0).length;

  const tagMap = new Map<string, number>();
  for (const l of lessons) tagMap.set(l.tag, (tagMap.get(l.tag) ?? 0) + 1);
  const byTag: CountByKey[] = [...tagMap.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);

  const noContent = lessons.filter((l) => l.blocks.length === 0);
  const noQuiz = lessons.filter(isQuizEmpty);
  const noTrack = lessons.filter((l) => !l.trackId || !trackById.has(l.trackId));
  const untranslated = {
    en: lessons.filter((l) => !l.translations?.en?.title && !l.translations?.en?.blocks?.length),
    es: lessons.filter((l) => !l.translations?.es?.title && !l.translations?.es?.blocks?.length),
  };

  return {
    total,
    published,
    drafts,
    byLevel,
    byTrack,
    byTag,
    trackCount: tracks.length,
    emptyTracks,
    gaps: { noContent, noQuiz, noTrack, untranslated },
  };
}

// ─── Content quality (per-lesson) ──────────────────────────────────────────

export type LessonQuality = {
  id: string;
  name: string;
  level: Level;
  track: string;
  wordCount: number;
  blockCount: number;
  quizCount: number;
  fleschScore: number;
  bloom: string;
  hasEmoji: boolean;
  hasTranslationEn: boolean;
  hasTranslationEs: boolean;
};

function lessonText(l: Lesson): string {
  return l.blocks.map((b) => b.text || '').join(' \n');
}

export function computeLessonQuality(l: Lesson, tracks: Track[]): LessonQuality {
  const text = lessonText(l);
  const track = tracks.find((t) => t.id === l.trackId);
  return {
    id: l.id,
    name: l.name,
    level: l.level,
    track: track ? `${track.emoji} ${track.nameFr}` : '—',
    wordCount: wordCount(text),
    blockCount: l.blocks.length,
    quizCount: l.quizzes.length,
    fleschScore: flesch(text),
    bloom: bloomLevel(text),
    hasEmoji: !!l.emoji?.trim() && l.emoji !== '📖',
    hasTranslationEn: !!l.translations?.en?.blocks?.length,
    hasTranslationEs: !!l.translations?.es?.blocks?.length,
  };
}

export function computeQualityRows(lessons: Lesson[], tracks: Track[]): LessonQuality[] {
  return lessons.map((l) => computeLessonQuality(l, tracks));
}

// ─── Coverage summaries ────────────────────────────────────────────────────

export type CoverageSummary = {
  withContent: number;
  withQuiz: number;
  withTrack: number;
  withTranslationEn: number;
  withTranslationEs: number;
  /** Each is the percentage of all lessons. */
  pctContent: number;
  pctQuiz: number;
  pctTrack: number;
  pctEn: number;
  pctEs: number;
};

export function computeCoverage(health: CorpusHealth): CoverageSummary {
  const total = health.total;
  const withContent = total - health.gaps.noContent.length;
  const withQuiz = total - health.gaps.noQuiz.length;
  const withTrack = total - health.gaps.noTrack.length;
  const withTranslationEn = total - health.gaps.untranslated.en.length;
  const withTranslationEs = total - health.gaps.untranslated.es.length;
  return {
    withContent,
    withQuiz,
    withTrack,
    withTranslationEn,
    withTranslationEs,
    pctContent: pct(withContent, total),
    pctQuiz: pct(withQuiz, total),
    pctTrack: pct(withTrack, total),
    pctEn: pct(withTranslationEn, total),
    pctEs: pct(withTranslationEs, total),
  };
}

// ─── CSV export ────────────────────────────────────────────────────────────

export function qualityRowsToCsv(rows: LessonQuality[]): string {
  const headers = [
    'id',
    'name',
    'level',
    'track',
    'wordCount',
    'blockCount',
    'quizCount',
    'fleschScore',
    'bloom',
    'hasEmoji',
    'translatedEn',
    'translatedEs',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.name,
        r.level,
        r.track,
        r.wordCount,
        r.blockCount,
        r.quizCount,
        r.fleschScore,
        r.bloom,
        r.hasEmoji,
        r.hasTranslationEn,
        r.hasTranslationEs,
      ]
        .map(esc)
        .join(',')
    ),
  ];
  return lines.join('\n');
}
