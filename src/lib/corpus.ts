/**
 * Corpus data-access layer — the ONLY module that talks to the
 * `corpus_*` Supabase tables. Views/stores call these functions; they
 * never import `supabase` directly.
 */

import { supabase } from './supabase';
import {
  domainToRow,
  lessonToRow,
  rowToDomain,
  rowToLesson,
  rowToResource,
  rowToTrack,
  trackToRow,
  type DomainRow,
  type LessonRow,
  type ResourceRow,
  type TrackRow,
} from './mappers';
import type { Domain, Lesson, Resource, Track } from './types';

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

export async function fetchDomains(): Promise<Domain[]> {
  const { data, error } = await supabase
    .from('corpus_domains')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as DomainRow[]).map(rowToDomain);
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

/** Rename/merge a domain (tag) across every lesson that uses it. */
export async function renameTag(oldTag: string, newTag: string): Promise<void> {
  const { error } = await supabase
    .from('corpus_lessons')
    .update({ tag: newTag })
    .eq('tag', oldTag);
  if (error) throw error;
}

// ─── Domain writes ─────────────────────────────────────────────────────────

export async function upsertDomain(d: Domain): Promise<Domain> {
  const { data, error } = await supabase
    .from('corpus_domains')
    .upsert(domainToRow(d), { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToDomain(data as DomainRow);
}

export async function insertDomains(domains: Domain[]): Promise<number> {
  if (domains.length === 0) return 0;
  const { data, error } = await supabase
    .from('corpus_domains')
    .upsert(domains.map(domainToRow), { onConflict: 'id' })
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function deleteDomain(id: string): Promise<void> {
  const { error } = await supabase.from('corpus_domains').delete().eq('id', id);
  if (error) throw error;
}

// ─── File upload (resource library) ────────────────────────────────────────

/** Upload a file to the public `resources` bucket; returns its public URL. */
export async function uploadResourceFile(file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9.\-_]+/g, '-');
  const path = `${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('resources').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('resources').getPublicUrl(path);
  return data.publicUrl;
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
  // Corpus tables not created yet → point the admin at the migration.
  if (
    e.code === 'PGRST205' ||
    e.code === '42P01' ||
    /could not find the table|relation .* does not exist/i.test(e.message ?? '')
  ) {
    return 'Corpus tables not found — run the 0002_corpus_admin.sql migration first.';
  }
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) {
    return 'Permission denied — admin role required.';
  }
  return e.message ?? 'Request failed';
}
