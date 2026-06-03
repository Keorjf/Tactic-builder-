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

Apply both migrations to the shared project:

| Migration                          | Adds                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `0002_corpus_admin.sql`            | `profiles.role`, `is_admin()`, `corpus_tracks/lessons/resources` + RLS        |
| `0003_admin_analytics.sql`         | `admin_global_counts` / `admin_top_completed_lessons` / `admin_hardest_lessons` / `admin_mission_claims_summary` RPCs for the Stats view |

**Option A — SQL editor (simplest):** paste each file into the Supabase
dashboard → SQL editor and run it (both are idempotent).

**Option B — CLI:**

```sh
supabase link --project-ref twjyajjfndsquhctxgvm
supabase db push
```

Then grant yourself admin (one-time):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### Edge function (for AI tabs)

```sh
supabase functions deploy admin-ai --no-verify-jwt
# OPENAI_API_KEY / OPENAI_MODEL secrets are already set for tact-chat
# and reused here. If you need to set them:
# supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
```

The function is admin-gated — it verifies the caller's JWT and rejects
anyone whose `profiles.role !== 'admin'` with a 403, so the OpenAI key
never reaches the browser.

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
  lib/      supabase.ts  types.ts  corpus.ts  ai.ts  mappers.ts
            format.ts  analytics.ts  seed.ts  richtext.tsx
  store/    auth.ts  corpus.ts  analytics.ts
  components/                # AppShell, RequireAdmin, Loader, Toast,
                             # Drawer, Modal, BlockEditor, QuizEditor,
                             # LessonCard, BarRow
  views/                     # AuthView, ExploreView, ExportView,
                             # StatsView, IdeasView, MarketingView,
                             # AgentsView, LessonEditorDrawer,
                             # PreviewDrawer
supabase/
  migrations/0002_corpus_admin.sql
  migrations/0003_admin_analytics.sql
  functions/admin-ai/        # OpenAI proxy (admin-gated)
legacy/                      # original HTML app (read-only reference)
```

## Tabs

| Tab        | Backed by                                                                     |
| ---------- | ----------------------------------------------------------------------------- |
| Explore    | `corpus_lessons` CRUD + drawer editor + preview                               |
| Ideas      | `admin-ai` task `lesson_ideas` / `module_ideas`                               |
| Export     | JSON + starter-corpus seed import                                             |
| Stats      | corpus health (in-browser) + admin RPCs + Flesch/Bloom quality table + CSV    |
| Marketing  | `admin-ai` task `marketing` (headlines, social, value props, CTA)             |
| AI Agents  | `admin-ai` task `run_agent` — 6 built-in agents over the live corpus context  |

## Build status

All 6 phases shipped. App is feature-complete for the original SPA's scope,
plus real Supabase data, real OpenAI-powered AI, and a tighter design system.
