# TACTIC Corpus Builder

Admin dashboard for managing the Tactic Academy lesson corpus, content, and
users. Built with **Vite + React + TypeScript**, wired to the shared
**Supabase** project, with **OpenAI** powering the AI features (via a Supabase
edge function). Deployable on **Vercel**.

> Converted from the original single-file HTML/CSS/JS app (kept for reference
> under [`legacy/`](./legacy)).

## Stack

- Vite + React 18 + TypeScript
- react-router-dom v6 (routing) · zustand (state)
- @supabase/supabase-js (auth + data)
- CSS Modules + design tokens copied verbatim from the legacy app

## Local development

```sh
npm install
cp .env.example .env.local   # then fill in the values (already provided for the shared project)
npm run dev                  # → http://localhost:5173
```

`.env.local` needs:

```
VITE_SUPABASE_URL=https://twjyajjfndsquhctxgvm.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## Supabase setup (one-time)

The app needs the `0002_corpus_admin.sql` migration applied to the shared
project. It adds `profiles.role`, the `is_admin()` helper, and the
`corpus_tracks` / `corpus_lessons` / `corpus_resources` tables with RLS.

**Option A — SQL editor (simplest):** paste
[`supabase/migrations/0002_corpus_admin.sql`](./supabase/migrations/0002_corpus_admin.sql)
into the Supabase dashboard → SQL editor and run it (idempotent).

**Option B — CLI:**

```sh
supabase link --project-ref twjyajjfndsquhctxgvm
supabase db push
```

Then grant yourself admin (one-time):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## Deploy (Vercel)

- Import this repo, framework preset **Vite**, build `npm run build`, output `dist`.
- Set env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- `vercel.json` already handles the SPA rewrite.
- Add the Vercel domain to Supabase → Auth → URL Configuration → Redirect URLs
  (so password-reset emails return correctly).

## Project layout

```
src/
  main.tsx  App.tsx          # entry + routes
  styles/                    # tokens.css (theme vars) + global.css
  lib/      supabase.ts  types.ts  corpus.ts  ai.ts  mappers.ts  format.ts
  store/    auth.ts  corpus.ts
  components/                # AppShell, RequireAdmin, Loader, Toast, …
  views/                     # AuthView, ExploreView, …
supabase/
  migrations/0002_corpus_admin.sql
  functions/admin-ai/        # OpenAI proxy (admin-gated)
legacy/                      # original HTML app (reference)
```

## Build status

Phase 1 (scaffold + design system + auth + admin guard) is complete.
Remaining phases (corpus CRUD, export, stats, AI agents) are tracked in the
implementation plan.
