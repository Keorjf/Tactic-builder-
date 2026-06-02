-- =========================================================================
-- Tactic Corpus Builder — admin role + corpus schema
--
-- Applied to the SAME Supabase project as the mobile app
-- (twjyajjfndsquhctxgvm). Extends 0001_init.sql. Idempotent — safe to
-- re-run.
--
-- Bootstrapping the first admin (run once in the SQL editor):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Sections:
--   1. profiles.role + is_admin() helper          (Phase 1)
--   2. corpus_tracks / corpus_lessons / resources  (Phase 2)
--   3. RLS — public read of published, admin write  (Phase 2)
-- =========================================================================

-- ─── 1. Admin role on profiles ───────────────────────────────────────────
alter table public.profiles
  add column if not exists role text not null default 'learner';

-- Constraint added separately so re-runs don't fail if it already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('learner','ux','ped','data','admin'));
  end if;
end $$;

-- Helper used by RLS policies on the corpus tables. SECURITY DEFINER so it
-- can read profiles.role regardless of the caller's own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- ─── 2. Corpus tables ─────────────────────────────────────────────────────

-- TRACKS
create table if not exists public.corpus_tracks (
  id          text primary key,                 -- slug, e.g. 'money-work'
  emoji       text not null default '📚',
  name_fr     text not null,                     -- label without emoji
  name_en     text,
  level       text not null default 'Débutant',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- LESSONS
create table if not exists public.corpus_lessons (
  id            text primary key,                -- 'd1','p3',...
  track_id      text references public.corpus_tracks(id) on delete set null,
  emoji         text not null default '📖',
  name          text not null,
  duration      text not null default '1 min',
  coins         int  not null default 80,
  xp            int  not null default 60,
  tag           text not null default 'Core',
  level         text not null default 'Débutant'
                  check (level in ('Débutant','Intermédiaire','Avancé','Expert')),
  blocks        jsonb not null default '[]'::jsonb,
  quizzes       jsonb not null default '[]'::jsonb,
  translations  jsonb not null default '{}'::jsonb,
  status        text not null default 'published'
                  check (status in ('draft','published')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists corpus_lessons_track_idx on public.corpus_lessons(track_id);
create index if not exists corpus_lessons_level_idx on public.corpus_lessons(level);

-- RESOURCES
create table if not exists public.corpus_resources (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('youtube','pdf','link')),
  title       text not null,
  url         text not null,
  lesson_id   text references public.corpus_lessons(id) on delete set null,
  track_id    text references public.corpus_tracks(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- updated_at maintenance (reuses public.touch_updated_at from 0001)
drop trigger if exists corpus_tracks_touch on public.corpus_tracks;
create trigger corpus_tracks_touch
  before update on public.corpus_tracks
  for each row execute function public.touch_updated_at();

drop trigger if exists corpus_lessons_touch on public.corpus_lessons;
create trigger corpus_lessons_touch
  before update on public.corpus_lessons
  for each row execute function public.touch_updated_at();

-- ─── 3. RLS — public read of published content, admin-only write ──────────

alter table public.corpus_tracks    enable row level security;
alter table public.corpus_lessons   enable row level security;
alter table public.corpus_resources enable row level security;

-- READ
drop policy if exists "tracks_read_all" on public.corpus_tracks;
create policy "tracks_read_all" on public.corpus_tracks
  for select using (true);

drop policy if exists "lessons_read_all" on public.corpus_lessons;
create policy "lessons_read_all" on public.corpus_lessons
  for select using (status = 'published' or public.is_admin());

drop policy if exists "resources_read_all" on public.corpus_resources;
create policy "resources_read_all" on public.corpus_resources
  for select using (true);

-- WRITE (admins only)
drop policy if exists "tracks_admin_write" on public.corpus_tracks;
create policy "tracks_admin_write" on public.corpus_tracks
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lessons_admin_write" on public.corpus_lessons;
create policy "lessons_admin_write" on public.corpus_lessons
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "resources_admin_write" on public.corpus_resources;
create policy "resources_admin_write" on public.corpus_resources
  for all using (public.is_admin()) with check (public.is_admin());
