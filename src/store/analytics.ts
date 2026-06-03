/**
 * Analytics store (zustand).
 *
 * Loads cross-user aggregates via the admin RPCs added in
 * supabase/migrations/0003_admin_analytics.sql. All RPCs are SECURITY
 * DEFINER + gated by public.is_admin(), so a non-admin gets an empty
 * payload back rather than a 500 — the loader just surfaces an empty
 * state in that case.
 */

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';
import { corpusErrorMessage } from '@/lib/corpus';

export type GlobalCounts = {
  total_users: number;
  admins: number;
  active_streakers: number;
  total_completions: number;
  total_coins: number;
  total_xp: number;
};

export type TopLessonRow = {
  lesson_id: string;
  completions: number;
  perfect_rate: number;
};

export type HardLessonRow = {
  lesson_id: string;
  completions: number;
  correct_rate: number;
};

export type MissionClaimRow = {
  mission_id: string;
  claims: number;
};

type State = {
  counts: GlobalCounts | null;
  topCompleted: TopLessonRow[];
  hardest: HardLessonRow[];
  missions: MissionClaimRow[];
  loading: boolean;
  loaded: boolean;
  /** Error surfaced to the view when the RPCs aren't available. */
  unavailable: boolean;
  load: () => Promise<void>;
};

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export const useAnalytics = create<State>((set) => ({
  counts: null,
  topCompleted: [],
  hardest: [],
  missions: [],
  loading: false,
  loaded: false,
  unavailable: false,

  load: async () => {
    set({ loading: true });
    try {
      const [c, top, hard, miss] = await Promise.all([
        supabase.rpc('admin_global_counts'),
        supabase.rpc('admin_top_completed_lessons', { p_limit: 10 }),
        supabase.rpc('admin_hardest_lessons', { p_min_completions: 3, p_limit: 10 }),
        supabase.rpc('admin_mission_claims_summary', { p_limit: 20 }),
      ]);

      // If any RPC is missing the entire feature is unavailable — point
      // the admin at the migration step.
      const missing =
        c.error?.code === 'PGRST202' ||
        c.error?.code === '42883' ||
        /could not find the function|does not exist/i.test(c.error?.message ?? '');
      if (missing) {
        set({ unavailable: true, loading: false, loaded: true });
        return;
      }

      const countsRow = (c.data?.[0] ?? null) as Record<string, unknown> | null;
      const counts: GlobalCounts | null = countsRow
        ? {
            total_users: toNum(countsRow.total_users),
            admins: toNum(countsRow.admins),
            active_streakers: toNum(countsRow.active_streakers),
            total_completions: toNum(countsRow.total_completions),
            total_coins: toNum(countsRow.total_coins),
            total_xp: toNum(countsRow.total_xp),
          }
        : null;

      set({
        counts,
        topCompleted: ((top.data ?? []) as TopLessonRow[]).map((r) => ({
          lesson_id: r.lesson_id,
          completions: toNum(r.completions),
          perfect_rate: toNum(r.perfect_rate),
        })),
        hardest: ((hard.data ?? []) as HardLessonRow[]).map((r) => ({
          lesson_id: r.lesson_id,
          completions: toNum(r.completions),
          correct_rate: toNum(r.correct_rate),
        })),
        missions: ((miss.data ?? []) as MissionClaimRow[]).map((r) => ({
          mission_id: r.mission_id,
          claims: toNum(r.claims),
        })),
        loaded: true,
        unavailable: false,
      });
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
      set({ unavailable: true });
    } finally {
      set({ loading: false });
    }
  },
}));
