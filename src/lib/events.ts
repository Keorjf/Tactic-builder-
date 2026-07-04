/**
 * Client wrappers for the learning- & marketing-event RPCs added in
 * 0005_events.sql. Each returns `null` when the RPC isn't deployed yet (so
 * the UI can fall back to its honest proxy state) and throws on real errors.
 */

import { supabase } from './supabase';

function isMissingRpc(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST202' ||
    err.code === '42883' ||
    /could not find the function|does not exist/i.test(err.message ?? '')
  );
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export type LessonTime = { lessonId: string; avgSeconds: number; learners: number };
export type FunnelStep = { stepIndex: number; learners: number };
export type Retention = { d7: number; d30: number; cohort: number };
export type CorrPoint = { lessonId: string; quizCompletion: number; pnl: number };
export type ChannelAttribution = {
  channel: string;
  touchpoints: number;
  conversions: number;
  conversionRate: number;
};

/** `null` => RPC not deployed; `[]` => deployed but no data. */
export async function fetchLessonTime(limit = 20): Promise<LessonTime[] | null> {
  const { data, error } = await supabase.rpc('admin_lesson_time', { p_limit: limit });
  if (error) {
    if (isMissingRpc(error)) return null;
    throw error;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    lessonId: String(r.lesson_id),
    avgSeconds: num(r.avg_seconds),
    learners: num(r.learners),
  }));
}

export async function fetchLessonFunnel(lessonId: string): Promise<FunnelStep[] | null> {
  const { data, error } = await supabase.rpc('admin_lesson_funnel', { p_lesson_id: lessonId });
  if (error) {
    if (isMissingRpc(error)) return null;
    throw error;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    stepIndex: num(r.step_index),
    learners: num(r.learners),
  }));
}

export async function fetchRetention(): Promise<Retention | null> {
  const { data, error } = await supabase.rpc('admin_retention');
  if (error) {
    if (isMissingRpc(error)) return null;
    throw error;
  }
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return { d7: 0, d30: 0, cohort: 0 };
  return { d7: num(row.d7), d30: num(row.d30), cohort: num(row.cohort) };
}

export async function fetchQuizTradingCorr(limit = 200): Promise<CorrPoint[] | null> {
  const { data, error } = await supabase.rpc('admin_quiz_trading_corr', { p_limit: limit });
  if (error) {
    if (isMissingRpc(error)) return null;
    throw error;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    lessonId: String(r.lesson_id ?? ''),
    quizCompletion: num(r.quiz_completion),
    pnl: num(r.pnl),
  }));
}

export async function fetchChannelAttribution(): Promise<ChannelAttribution[] | null> {
  const { data, error } = await supabase.rpc('admin_channel_attribution');
  if (error) {
    if (isMissingRpc(error)) return null;
    throw error;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    channel: String(r.channel),
    touchpoints: num(r.touchpoints),
    conversions: num(r.conversions),
    conversionRate: num(r.conversion_rate),
  }));
}
