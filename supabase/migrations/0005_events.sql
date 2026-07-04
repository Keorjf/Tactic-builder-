-- =========================================================================
-- Tactic Corpus Builder — learning & marketing event pipeline
--
-- Turns the "needs event tracking" scaffolds into real features by adding
-- the event tables the dashboards read, plus admin-gated RPCs that roll
-- them up. The MOBILE app is expected to write into these tables; until it
-- does, run supabase/seed/demo_analytics.sql to populate demo data.
--
-- Idempotent. Safe to re-run.
--
--   lesson_events         — per-step progress + time-spent (funnel, time)
--   trading_sim_results   — simulated-trading PnL paired with quiz score
--   marketing_touchpoints — per-channel touches + conversions (attribution)
--
--   admin_lesson_time()        — avg seconds per lesson
--   admin_lesson_funnel(id)    — drop-off funnel for one lesson
--   admin_retention()          — D+7 / D+30 retention
--   admin_quiz_trading_corr()  — scatter points (quiz completion × PnL)
--   admin_channel_attribution()— conversions attributed per channel
-- =========================================================================

-- ─── Tables ───────────────────────────────────────────────────────────────

create table if not exists public.lesson_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                       -- learner (auth.users.id)
  lesson_id   text,
  kind        text not null default 'step'
                check (kind in ('start','step','complete')),
  step_index  int not null default 0,     -- which block/step within the lesson
  seconds     int not null default 0,     -- time spent in this event
  created_at  timestamptz not null default now()
);
create index if not exists lesson_events_lesson_idx on public.lesson_events(lesson_id);
create index if not exists lesson_events_user_idx   on public.lesson_events(user_id);
create index if not exists lesson_events_created_idx on public.lesson_events(created_at);

create table if not exists public.trading_sim_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  lesson_id       text,                    -- lesson whose quiz this pairs with
  quiz_completion numeric not null default 0,  -- 0..1
  pnl             numeric not null default 0,   -- simulated euro PnL
  created_at      timestamptz not null default now()
);
create index if not exists trading_sim_created_idx on public.trading_sim_results(created_at);

create table if not exists public.marketing_touchpoints (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  campaign_id  uuid references public.marketing_campaigns(id) on delete set null,
  channel      text not null default 'Other',
  converted    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists marketing_touchpoints_channel_idx on public.marketing_touchpoints(channel);

-- ─── RLS — admins read everything; learners insert their own rows ─────────

alter table public.lesson_events         enable row level security;
alter table public.trading_sim_results   enable row level security;
alter table public.marketing_touchpoints enable row level security;

drop policy if exists "lesson_events_admin_all" on public.lesson_events;
create policy "lesson_events_admin_all" on public.lesson_events
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "lesson_events_owner_insert" on public.lesson_events;
create policy "lesson_events_owner_insert" on public.lesson_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "trading_sim_admin_all" on public.trading_sim_results;
create policy "trading_sim_admin_all" on public.trading_sim_results
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "trading_sim_owner_insert" on public.trading_sim_results;
create policy "trading_sim_owner_insert" on public.trading_sim_results
  for insert with check (auth.uid() = user_id);

drop policy if exists "touchpoints_admin_all" on public.marketing_touchpoints;
create policy "touchpoints_admin_all" on public.marketing_touchpoints
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── RPCs (admin-gated, over our own tables) ─────────────────────────────

-- Average time-on-lesson + distinct learners.
create or replace function public.admin_lesson_time(p_limit int default 20)
returns table (lesson_id text, avg_seconds numeric, learners bigint)
language sql stable security definer set search_path = public
as $$
  select
    lesson_id,
    round(sum(seconds)::numeric / nullif(count(distinct user_id), 0), 0) as avg_seconds,
    count(distinct user_id)::bigint                                       as learners
  from public.lesson_events
  where public.is_admin()
  group by lesson_id
  order by avg_seconds desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
revoke all on function public.admin_lesson_time(int) from public;
grant execute on function public.admin_lesson_time(int) to authenticated;

-- Drop-off funnel for a single lesson: distinct learners who reached each
-- step (cumulative — step N count includes everyone who got past N).
create or replace function public.admin_lesson_funnel(p_lesson_id text)
returns table (step_index int, learners bigint)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_max int;
begin
  if not public.is_admin() then
    return;
  end if;

  create temp table _reached on commit drop as
    select user_id, max(step_index) as max_step
    from public.lesson_events
    where lesson_id = p_lesson_id
    group by user_id;

  select coalesce(max(max_step), 0) into v_max from _reached;

  return query
    select s.step::int as step_index,
           (select count(*) from _reached r where r.max_step >= s.step)::bigint as learners
    from generate_series(0, v_max) s(step)
    order by s.step;
end;
$$;
revoke all on function public.admin_lesson_funnel(text) from public;
grant execute on function public.admin_lesson_funnel(text) to authenticated;

-- D+7 / D+30 retention: share of learners whose activity span reaches
-- 7 / 30 days after their first event.
create or replace function public.admin_retention()
returns table (d7 numeric, d30 numeric, cohort bigint)
language sql stable security definer set search_path = public
as $$
  with firsts as (
    select user_id,
           min(created_at)::date as first_day,
           max(created_at)::date as last_day
    from public.lesson_events
    where public.is_admin() and user_id is not null
    group by user_id
  )
  select
    round(count(*) filter (where last_day >= first_day + 7)::numeric  / nullif(count(*), 0), 3) as d7,
    round(count(*) filter (where last_day >= first_day + 30)::numeric / nullif(count(*), 0), 3) as d30,
    count(*)::bigint as cohort
  from firsts;
$$;
revoke all on function public.admin_retention() from public;
grant execute on function public.admin_retention() to authenticated;

-- Scatter points: quiz completion (x, 0..1) vs simulated-trading PnL (y).
create or replace function public.admin_quiz_trading_corr(p_limit int default 200)
returns table (lesson_id text, quiz_completion numeric, pnl numeric)
language sql stable security definer set search_path = public
as $$
  select lesson_id, quiz_completion, pnl
  from public.trading_sim_results
  where public.is_admin()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 2000));
$$;
revoke all on function public.admin_quiz_trading_corr(int) from public;
grant execute on function public.admin_quiz_trading_corr(int) to authenticated;

-- Channel attribution: touchpoints, conversions, conversion rate per channel.
create or replace function public.admin_channel_attribution()
returns table (channel text, touchpoints bigint, conversions bigint, conversion_rate numeric)
language sql stable security definer set search_path = public
as $$
  select
    channel,
    count(*)::bigint                                                       as touchpoints,
    count(*) filter (where converted)::bigint                             as conversions,
    round(count(*) filter (where converted)::numeric / nullif(count(*), 0), 4) as conversion_rate
  from public.marketing_touchpoints
  where public.is_admin()
  group by channel
  order by conversions desc, touchpoints desc;
$$;
revoke all on function public.admin_channel_attribution() from public;
grant execute on function public.admin_channel_attribution() to authenticated;
