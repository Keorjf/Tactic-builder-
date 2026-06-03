-- =========================================================================
-- Admin analytics — cross-user aggregate functions
--
-- The user-data tables (lesson_completions, profiles, mission_claims) have
-- per-owner RLS on the mobile side. Admins need cross-user counts for the
-- Stats view. Rather than open those tables up, expose narrow
-- SECURITY DEFINER functions that gate on public.is_admin() and return
-- aggregates only.
--
-- Idempotent. Safe to re-run.
-- =========================================================================

-- Global counts (users, lessons completed, coins/xp awarded).
create or replace function public.admin_global_counts()
returns table (
  total_users        bigint,
  admins             bigint,
  active_streakers   bigint,    -- users with streak > 0
  total_completions  bigint,
  total_coins        bigint,
  total_xp           bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles)                                       as total_users,
    (select count(*) from public.profiles where role = 'admin')                  as admins,
    (select count(*) from public.profiles where coalesce(streak, 0) > 0)         as active_streakers,
    (select count(*) from public.lesson_completions)                             as total_completions,
    coalesce((select sum(coins) from public.profiles), 0)::bigint                as total_coins,
    coalesce((select sum(xp) from public.profiles), 0)::bigint                   as total_xp
  where public.is_admin();
$$;

revoke all on function public.admin_global_counts() from public;
grant execute on function public.admin_global_counts() to authenticated;

-- Top N most-completed lessons.
create or replace function public.admin_top_completed_lessons(p_limit int default 10)
returns table (
  lesson_id       text,
  completions     bigint,
  perfect_rate    numeric  -- 0..1, share of completions that were quiz_perfect
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lc.lesson_id,
    count(*)::bigint                                                              as completions,
    round((sum(case when lc.quiz_perfect then 1 else 0 end)::numeric
           / nullif(count(*), 0)), 3)                                             as perfect_rate
  from public.lesson_completions lc
  where public.is_admin()
  group by lc.lesson_id
  order by completions desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

revoke all on function public.admin_top_completed_lessons(int) from public;
grant execute on function public.admin_top_completed_lessons(int) to authenticated;

-- Hardest lessons (lowest quiz_correct rate, min N completions to be
-- statistically meaningful).
create or replace function public.admin_hardest_lessons(p_min_completions int default 3, p_limit int default 10)
returns table (
  lesson_id     text,
  completions   bigint,
  correct_rate  numeric  -- 0..1
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lc.lesson_id,
    count(*)::bigint                                                              as completions,
    round((sum(case when lc.quiz_correct then 1 else 0 end)::numeric
           / nullif(count(*), 0)), 3)                                             as correct_rate
  from public.lesson_completions lc
  where public.is_admin()
  group by lc.lesson_id
  having count(*) >= greatest(1, p_min_completions)
  order by correct_rate asc, completions desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

revoke all on function public.admin_hardest_lessons(int, int) from public;
grant execute on function public.admin_hardest_lessons(int, int) to authenticated;

-- Mission claims breakdown (counts by mission_id).
create or replace function public.admin_mission_claims_summary(p_limit int default 20)
returns table (
  mission_id  text,
  claims      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    mc.mission_id,
    count(*)::bigint as claims
  from public.mission_claims mc
  where public.is_admin()
  group by mc.mission_id
  order by claims desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.admin_mission_claims_summary(int) from public;
grant execute on function public.admin_mission_claims_summary(int) to authenticated;
