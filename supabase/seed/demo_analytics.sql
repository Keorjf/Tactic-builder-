-- =========================================================================
-- DEMO ANALYTICS DATA — SYNTHETIC, NOT REAL METRICS
--
-- Populates lesson_events / trading_sim_results / marketing_touchpoints so
-- the Learning-analytics and Marketing-attribution dashboards render with
-- realistic-looking data BEFORE the mobile app emits real events.
--
-- ⚠️  Everything inserted here is randomly generated. Do NOT make real
--     decisions on it. Run the CLEANUP block at the bottom to remove it.
--
-- Requires: 0004_feedback.sql + 0005_events.sql applied, and at least a few
-- rows in corpus_lessons (and ideally marketing_campaigns).
--
-- Run in the Supabase SQL editor (runs as table owner → bypasses RLS).
-- =========================================================================

do $$
declare
  v_lessons int;
begin
  select count(*) into v_lessons from public.corpus_lessons;
  if v_lessons = 0 then
    raise notice 'No corpus_lessons — seed the corpus first. Skipping.';
    return;
  end if;

  -- 80 synthetic learners, each with a skill level and a signup date.
  create temp table _u on commit drop as
    select
      gen_random_uuid()                                            as uid,
      (now() - (random() * 45 || ' days')::interval)::date         as signup,
      greatest(0.05, least(0.98, random()))                        as skill
    from generate_series(1, 80);

  -- Per-learner lesson attempts: each learner attempts a random handful of
  -- lessons and reaches a max step proportional to skill (→ funnel drop-off).
  create temp table _attempt on commit drop as
    select
      u.uid,
      u.signup,
      u.skill,
      l.id                                  as lesson_id,
      (1 + floor(u.skill * 5 + random() * 2))::int as max_step
    from _u u
    join lateral (
      select id from public.corpus_lessons order by random()
      limit (2 + floor(u.skill * 6))::int
    ) l on true;

  -- Step events (start + each step up to max_step), with time spent.
  insert into public.lesson_events (user_id, lesson_id, kind, step_index, seconds, created_at)
  select
    a.uid,
    a.lesson_id,
    case when s = 0 then 'start' else 'step' end,
    s,
    (15 + floor(random() * 90))::int,
    a.signup + (random() * 2 || ' days')::interval
  from _attempt a
  cross join lateral generate_series(0, a.max_step) s;

  -- Completion events for attempts that finished (high skill / full step run).
  insert into public.lesson_events (user_id, lesson_id, kind, step_index, seconds, created_at)
  select a.uid, a.lesson_id, 'complete', a.max_step, (10 + floor(random() * 40))::int,
         a.signup + (random() * 3 || ' days')::interval
  from _attempt a
  where random() < a.skill;

  -- Return visits → drives D+7 / D+30 retention.
  insert into public.lesson_events (user_id, lesson_id, kind, step_index, seconds, created_at)
  select u.uid, a.lesson_id, 'step', 1, (20 + floor(random() * 60))::int,
         u.signup + ((7 + random() * 5) || ' days')::interval
  from _u u
  join lateral (select lesson_id from _attempt a where a.uid = u.uid order by random() limit 1) a on true
  where random() < (u.skill * 0.7);

  insert into public.lesson_events (user_id, lesson_id, kind, step_index, seconds, created_at)
  select u.uid, a.lesson_id, 'step', 1, (20 + floor(random() * 60))::int,
         u.signup + ((30 + random() * 6) || ' days')::interval
  from _u u
  join lateral (select lesson_id from _attempt a where a.uid = u.uid order by random() limit 1) a on true
  where random() < (u.skill * 0.35);

  -- Trading-sim results: quiz completion ~ skill; PnL correlated with it + noise.
  insert into public.trading_sim_results (user_id, lesson_id, quiz_completion, pnl, created_at)
  select
    u.uid,
    a.lesson_id,
    round(least(1, greatest(0, u.skill + (random() * 0.3 - 0.15)))::numeric, 2)  as quiz_completion,
    round((u.skill * 240 - 70 + (random() * 140 - 70))::numeric, 2)             as pnl,
    u.signup + (random() * 10 || ' days')::interval
  from _u u
  join lateral (select lesson_id from _attempt a where a.uid = u.uid order by random() limit 2) a on true;

  -- Marketing touchpoints across existing campaigns/channels (attribution).
  if exists (select 1 from public.marketing_campaigns) then
    insert into public.marketing_touchpoints (user_id, campaign_id, channel, converted, created_at)
    select u.uid, c.id, c.channel, (random() < (0.05 + u.skill * 0.25)), u.signup
    from _u u
    join lateral (select id, channel from public.marketing_campaigns order by random() limit 1) c on true;
  else
    insert into public.marketing_touchpoints (user_id, channel, converted, created_at)
    select u.uid,
           (array['Meta','Google','TikTok','Email','Organic'])[1 + floor(random() * 5)],
           (random() < (0.05 + u.skill * 0.25)),
           u.signup
    from _u u;
  end if;

  raise notice 'Demo analytics seeded for % learners.', (select count(*) from _u);
end $$;

-- ─── CLEANUP (uncomment + run to remove all demo data) ────────────────────
-- truncate public.lesson_events;
-- truncate public.trading_sim_results;
-- truncate public.marketing_touchpoints;
