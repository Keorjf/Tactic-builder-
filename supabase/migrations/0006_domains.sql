-- =========================================================================
-- Tactic Corpus Builder — Domain taxonomy + file uploads
--
-- Introduces DOMAIN as the top-level taxonomy: Domain → Module → Lesson.
-- (Level is no longer used as an organizing axis in the admin UI; the
-- corpus_lessons.level column stays for mobile-app compatibility.)
--
-- Idempotent. Safe to re-run.
--
--   corpus_domains            — the 8 (A–H) domains, editable
--   corpus_tracks.domain_id   — a module belongs to one domain
--   corpus_tracks.core_question
--   storage bucket 'resources' — uploads for the resource library
-- =========================================================================

-- ─── Domains ──────────────────────────────────────────────────────────────

create table if not exists public.corpus_domains (
  id          text primary key,             -- 'dom-a' … 'dom-h'
  code        text,                          -- 'A' … 'H'
  name        text not null,
  emoji       text not null default '📚',
  objective   text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists corpus_domains_touch on public.corpus_domains;
create trigger corpus_domains_touch
  before update on public.corpus_domains
  for each row execute function public.touch_updated_at();

alter table public.corpus_domains enable row level security;
drop policy if exists "domains_read_all" on public.corpus_domains;
create policy "domains_read_all" on public.corpus_domains
  for select using (true);
drop policy if exists "domains_admin_write" on public.corpus_domains;
create policy "domains_admin_write" on public.corpus_domains
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── Modules belong to a domain + carry a core question ───────────────────

alter table public.corpus_tracks
  add column if not exists domain_id text references public.corpus_domains(id) on delete set null;
alter table public.corpus_tracks
  add column if not exists core_question text;
create index if not exists corpus_tracks_domain_idx on public.corpus_tracks(domain_id);

-- ─── Storage bucket for resource-library uploads ──────────────────────────

insert into storage.buckets (id, name, public)
values ('resources', 'resources', true)
on conflict (id) do nothing;

-- Public read; admins manage objects in the 'resources' bucket.
drop policy if exists "resources_public_read" on storage.objects;
create policy "resources_public_read" on storage.objects
  for select using (bucket_id = 'resources');

drop policy if exists "resources_admin_write" on storage.objects;
create policy "resources_admin_write" on storage.objects
  for all
  using (bucket_id = 'resources' and public.is_admin())
  with check (bucket_id = 'resources' and public.is_admin());
