/**
 * Corpus data-access layer — the ONLY module that talks to the
 * `corpus_*` Supabase tables. Views/stores call these functions; they
 * never import `supabase` directly.
 */

import { supabase } from './supabase';
import {
  lessonToRow,
  rowToLesson,
  rowToResource,
  rowToTrack,
  trackToRow,
  type LessonRow,
  type ResourceRow,
  type TrackRow,
} from './mappers';
import type { Lesson, Resource, Track } from './types';

// ─── Reads ─────────────────────────────────────────────────────────────────

export async function fetchTracks(): Promise<Track[]> {
  const { data, error } = await supabase
    .from('corpus_tracks')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as TrackRow[]).map(rowToTrack);
}

export async function fetchLessons(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('corpus_lessons')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return (data as LessonRow[]).map(rowToLesson);
}

export async function fetchResources(): Promise<Resource[]> {
  const { data, error } = await supabase
    .from('corpus_resources')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ResourceRow[]).map(rowToResource);
}

// ─── Lesson writes ─────────────────────────────────────────────────────────

export async function upsertLesson(lesson: Lesson): Promise<Lesson> {
  const { data, error } = await supabase
    .from('corpus_lessons')
    .upsert(lessonToRow(lesson), { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToLesson(data as LessonRow);
}

/** Bulk insert (used by the Phase 3 seed/import). Ignores conflicts. */
export async function insertLessons(lessons: Lesson[]): Promise<number> {
  if (lessons.length === 0) return 0;
  const rows = lessons.map(lessonToRow);
  const { data, error } = await supabase
    .from('corpus_lessons')
    .upsert(rows, { onConflict: 'id' })
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await supabase.from('corpus_lessons').delete().eq('id', id);
  if (error) throw error;
}

// ─── Track writes ──────────────────────────────────────────────────────────

export async function upsertTrack(track: Track): Promise<Track> {
  const { data, error } = await supabase
    .from('corpus_tracks')
    .upsert(trackToRow(track), { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTrack(data as TrackRow);
}

export async function insertTracks(tracks: Track[]): Promise<number> {
  if (tracks.length === 0) return 0;
  const { data, error } = await supabase
    .from('corpus_tracks')
    .upsert(tracks.map(trackToRow), { onConflict: 'id' })
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function deleteTrack(id: string): Promise<void> {
  const { error } = await supabase.from('corpus_tracks').delete().eq('id', id);
  if (error) throw error;
}

// ─── Resource writes ───────────────────────────────────────────────────────

export async function upsertResource(
  r: Omit<Resource, 'id' | 'createdAt'> & { id?: string }
): Promise<Resource> {
  const row: Partial<ResourceRow> = {
    ...(r.id ? { id: r.id } : {}),
    kind: r.kind,
    title: r.title,
    url: r.url,
    lesson_id: r.lessonId ?? null,
    track_id: r.trackId ?? null,
  };
  const { data, error } = await supabase
    .from('corpus_resources')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToResource(data as ResourceRow);
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await supabase.from('corpus_resources').delete().eq('id', id);
  if (error) throw error;
}

// ─── Error helper ──────────────────────────────────────────────────────────

/** Turn a Supabase error into a user-facing message (RLS denials etc.). */
export function corpusErrorMessage(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  if (!e) return 'Unknown error';
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) {
    return 'Permission denied — admin role required.';
  }
  return e.message ?? 'Request failed';
}
