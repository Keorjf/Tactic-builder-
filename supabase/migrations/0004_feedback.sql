-- =========================================================================
-- Tactic Corpus Builder — feedback round
--
-- Applied to the SAME Supabase project as 0002/0003. Idempotent — safe to
-- re-run. Adds the schema the feedback features need:
--
--   1. Content management   — corpus_tracks.theme, corpus_lessons.summary,
--                             a syllabus row in corpus_resources (kind 'pdf')
--   2. AI agents            — admin_agent_reports (persisted run history)
--   3. Marketing            — marketing_campaigns + admin_marketing_kpis()
--   4. Admin & permissions  — admin_audit_log + admin_list_members()
--                             + admin_set_role() (writes an audit entry)
-- =========================================================================

-- ─── 1. Content management ────────────────────────────────────────────────

-- Themes at the Track level (mirrors the per-lesson theme idea).
alter table public.corpus_tracks
  add column if not exists theme text;

-- Course summary captured while authoring a lesson.
alter table public.corpus_lessons
  add column if not exists summary text;

-- The resources `kind` check predates the 'syllabus' kind. Widen it so the
-- syllabus PDF can live alongside the other external resources.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'corpus_resources_kind_check'
  ) then
    alter table public.corpus_resources drop constraint corpus_resources_kind_check;
  end if;
  alter table public.corpus_resources
    add constraint corpus_resources_kind_check
    check (kind in ('youtube','pdf','link','image','audio','article','idea','syllabus'));
end $$;

-- ─── 2. AI agents — persisted report history ──────────────────────────────

create table if not exists public.admin_agent_reports (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text not null,                 -- 'recommendation', 'marketing', …
  agent_label  text not null,
  status       text not null default 'new'
                 check (status in ('new','in_progress','done','archived')),
  report       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists admin_agent_reports_agent_idx
  on public.admin_agent_reports(agent_id);
create index if not exists admin_agent_reports_created_idx
  on public.admin_agent_reports(created_at desc);

drop trigger if exists admin_agent_reports_touch on public.admin_agent_reports;
create trigger admin_agent_reports_touch
  before update on public.admin_agent_reports
  for each row execute function public.touch_updated_at();

alter table public.admin_agent_reports enable row level security;
drop policy if exists "agent_reports_admin_all" on public.admin_agent_reports;
create policy "agent_reports_admin_all" on public.admin_agent_reports
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── 3. Marketing — imported campaigns + KPI rollup ───────────────────────

create table if not exists public.marketing_campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  channel      text not null default 'Other',     -- Meta, Google, Email, …
  spend        numeric not null default 0,
  impressions  bigint  not null default 0,
  clicks       bigint  not null default 0,
  conversions  bigint  not null default 0,         -- signups / installs
  revenue      numeric not null default 0,
  start_date   date,
  end_date     date,
  status       text not null default 'active'
                 check (status in ('planned','active','paused','done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists marketing_campaigns_channel_idx
  on public.marketing_campaigns(channel);

drop trigger if exists marketing_campaigns_touch on public.marketing_campaigns;
create trigger marketing_campaigns_touch
  before update on public.marketing_campaigns
  for each row execute function public.touch_updated_at();

alter table public.marketing_campaigns enable row level security;
drop policy if exists "marketing_admin_all" on public.marketing_campaigns;
create policy "marketing_admin_all" on public.marketing_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

-- Aggregate marketing KPIs (ROI, CAC, conversion rate, totals). Returns a
-- single row so the dashboard can render without pulling every campaign.
create or replace function public.admin_marketing_kpis()
returns table (
  total_spend     numeric,
  total_revenue   numeric,
  total_clicks    bigint,
  total_conversions bigint,
  total_impressions bigint,
  roi             numeric,   -- (revenue - spend) / spend
  cac             numeric,   -- spend / conversions
  conversion_rate numeric,   -- conversions / clicks
  campaigns       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(spend), 0)                                              as total_spend,
    coalesce(sum(revenue), 0)                                            as total_revenue,
    coalesce(sum(clicks), 0)::bigint                                     as total_clicks,
    coalesce(sum(conversions), 0)::bigint                               as total_conversions,
    coalesce(sum(impressions), 0)::bigint                              as total_impressions,
    round((coalesce(sum(revenue), 0) - coalesce(sum(spend), 0))
          / nullif(sum(spend), 0), 3)                                    as roi,
    round(coalesce(sum(spend), 0) / nullif(sum(conversions), 0), 2)      as cac,
    round(coalesce(sum(conversions), 0)::numeric
          / nullif(sum(clicks), 0), 4)                                   as conversion_rate,
    count(*)::bigint                                                     as campaigns
  from public.marketing_campaigns
  where public.is_admin();
$$;

revoke all on function public.admin_marketing_kpis() from public;
grant execute on function public.admin_marketing_kpis() to authenticated;

-- ─── 4. Admin & permissions ───────────────────────────────────────────────

-- Audit trail of admin-panel actions (role changes, invites, …).
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,                 -- 'set_role', 'invite', …
  target       text,                          -- email / id the action touched
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;
-- Admins may read the log; writes happen through the SECURITY DEFINER
-- helpers below (or the edge function), never directly from the client.
drop policy if exists "audit_admin_read" on public.admin_audit_log;
create policy "audit_admin_read" on public.admin_audit_log
  for select using (public.is_admin());
drop policy if exists "audit_admin_insert" on public.admin_audit_log;
create policy "audit_admin_insert" on public.admin_audit_log
  for insert with check (public.is_admin());

-- List collaborators with their role. SECURITY DEFINER so an admin can see
-- every profile without opening profiles' own RLS up.
create or replace function public.admin_list_members()
returns table (
  id          uuid,
  email       text,
  full_name   text,
  role        text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.role, p.created_at
  from public.profiles p
  where public.is_admin()
  order by p.created_at asc nulls last;
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

-- Assign a role to a collaborator and record it in the audit log. Returns
-- the updated role. Refuses to demote the last remaining admin.
create or replace function public.admin_set_role(p_id uuid, p_role text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_email   text;
  v_target  text;
  v_admins  int;
begin
  if not public.is_admin() then
    raise exception 'Admin role required';
  end if;
  if p_role not in ('learner','ux','ped','data','admin') then
    raise exception 'Invalid role %', p_role;
  end if;

  -- Guard: never strip the final admin.
  select count(*) into v_admins from public.profiles where role = 'admin';
  if v_admins <= 1 and p_role <> 'admin'
     and exists (select 1 from public.profiles where id = p_id and role = 'admin') then
    raise exception 'Cannot remove the last admin';
  end if;

  update public.profiles set role = p_role where id = p_id
    returning email into v_target;

  select email into v_email from public.profiles where id = v_actor;
  insert into public.admin_audit_log (actor_id, actor_email, action, target, detail)
  values (v_actor, v_email, 'set_role', coalesce(v_target, p_id::text),
          jsonb_build_object('role', p_role));

  return p_role;
end;
$$;

revoke all on function public.admin_set_role(uuid, text) from public;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
