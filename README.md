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
| `0004_feedback.sql`                | `corpus_tracks.theme`, `corpus_lessons.summary`, widened resource kinds, `admin_agent_reports` (report history), `marketing_campaigns` + `admin_marketing_kpis()`, `admin_audit_log` + `admin_list_members()` / `admin_set_role()` |
| `0005_events.sql`                  | `lesson_events` / `trading_sim_results` / `marketing_touchpoints` + RPCs `admin_lesson_time` / `admin_lesson_funnel` / `admin_retention` / `admin_quiz_trading_corr` / `admin_channel_attribution` (real learning + attribution analytics) |
| `0006_domains.sql`                 | `corpus_domains` (Domain → Module → Lesson), `corpus_tracks.domain_id` + `core_question`, public `resources` Storage bucket for file uploads |

**Option A — SQL editor (simplest):** paste each file into the Supabase
dashboard → SQL editor and run it (all are idempotent).

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
#
# Collaborator invites (Members tab) use the service-role key. It is
# injected automatically in the Supabase runtime as SUPABASE_SERVICE_ROLE_KEY,
# so no extra secret is normally needed.
```

The function is admin-gated — it verifies the caller's JWT and rejects
anyone whose `profiles.role !== 'admin'` with a 403, so the OpenAI key
never reaches the browser. The `invite` task additionally uses the
service-role key to send the Supabase Auth invite and pre-assign the role.

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

| Tab          | Backed by                                                                     |
| ------------ | ----------------------------------------------------------------------------- |
| Explore      | `corpus_lessons` CRUD + drawer editor + preview · Domain/Module filters + sort |
| Ideas        | `admin-ai` task `lesson_ideas` / `module_ideas`                               |
| Content      | `corpus_resources` library + syllabus loader + per-track themes               |
| Export       | JSON + starter-corpus seed import                                             |
| Stats        | corpus health + admin RPCs + learning analytics (quiz-mastery scatter, retention proxy) + quality table + CSV |
| Marketing    | KPI dashboard (`marketing_campaigns` + `admin_marketing_kpis`) + `admin-ai` copy generator |
| AI Agents    | `admin-ai` task `run_agent` — 11-agent supervised pipeline (Corpus · Syllabus · Performance · User Model · Recommendations · Create · Marketing · News · Mission · Notification · ★ TACT Robot) + persisted, filterable report history |
| Collaborators| `admin_list_members` / `admin_set_role` + audit log + `admin-ai` task `invite` |

## Feedback round (see `supabase/migrations/0004_feedback.sql`)

- **Content management** — syllabus loader (Content tab), resource library UI over
  `corpus_resources`, course-summary field on lessons, per-track themes, translation
  viewer in the preview drawer, Domain filter + sort in Explore.
- **AI agents** — "Translation Coach" replaced by **Recommendation Agent** (weekly
  action plan / gaps / roadmap); added **Marketing Agent** + **News Économique**;
  every run is saved to `admin_agent_reports` and browsable in the Reports sub-tab,
  filterable by agent, date, and status.
- **Analytics** — Marketing KPI dashboard (ROI/CAC/conversion/channels/budget) plus a
  full Learning-analytics section backed by a real event pipeline (`0005_events.sql`):
  drop-off funnel per lesson, real-time-spent per lesson, D+7/D+30 retention,
  Quiz-completion ↔ simulated-trading-PnL scatter, and channel attribution. Each
  dashboard reads its event table; until the **mobile app** writes those events, run
  `supabase/seed/demo_analytics.sql` to populate clearly-labelled DEMO data. With no
  events at all, the views fall back to honest proxies (streak-based retention, quiz
  drop-off) rather than blank charts.
- **Admin & permissions** — Collaborators tab: invite, assign roles, audit log.

### Round 3 (testing feedback)

- **Editable modules** — Content → Modules: add, edit (emoji/name/level/theme), and delete
  modules (deleting detaches lessons, doesn't remove them).
- **Domains, modules & lessons** — Content → Domains renames/merges domains across lessons;
  new domains are added by typing in the lesson editor's free-text Domain field; modules and
  lessons are fully add/edit/delete.
- **Robot Tact** — a floating AI assistant pinned to every page (`admin-ai` task `assistant`),
  answers questions about the corpus using live stats.
- **Generate lessons from syllabus** — Content → Syllabus: paste the syllabus, generate lesson
  drafts (`admin-ai` task `syllabus_lessons`), then "Edit & save" each in the lesson editor.
- **Import from device** — Export tab: upload a `.json` corpus file (this app's export or a
  compatible dump); lessons + modules are normalized and imported.

No new migration this round. Redeploy the edge function for the new `assistant` /
`syllabus_lessons` tasks: `supabase functions deploy admin-ai --no-verify-jwt`.

### Round 4 (Domain taxonomy)

Introduces **Domain → Module → Lesson** as the taxonomy (8 domains, 43 modules, 516
lessons — from `src/lib/syllabus.ts`). Apply `0006_domains.sql`.

- **Domain is the top level** — a module belongs to one domain; a lesson's domain is
  its module's. **Level (Débutant…) is removed from the admin UI** (the column stays on
  lessons for mobile-app compatibility).
- **Explore** filters by domain (not level), grouped Domain → Module, with quick
  **+ Add domain / + Add module / + New lesson** actions.
- **Content** now manages **Domains** (add/edit/delete) and **Modules** (with domain +
  core question), plus **Import full syllabus** (scaffolds the whole A–H hierarchy) and
  **file upload from computer** into the `resources` Storage bucket.
- **Ideas** brainstorms by domain; **Stats** breaks down + filters by domain.

Migration: `0006_domains.sql` adds `corpus_domains`, `corpus_tracks.domain_id` +
`core_question`, and the public `resources` Storage bucket. No edge-function change.

### Round 5 (TACT Robot = supervised agent pipeline)

The AI Agents tab is now a **dependency pipeline supervised by the TACT Robot**, per the
"Expansion of TACT Robot Scope" brief:

```
1 Corpus → 2 Syllabus ┐
3 Performance → 4 User Model → 5 Recommendations → 6 Create
7 Marketing ──────────────────────────────────────────────┘
★ TACT Robot (supervisor) validates the output of ALL of the above
```

- Each agent declares `dependsOn` and is fed its upstream agents' latest reports plus the
  right context (corpus, syllabus coverage, performance analytics, marketing KPIs). The
  sidebar shows readiness ("needs upstream") and the detail view shows dependency status.
- **Create agent** generates real course content: pick a module → it produces blocks + quiz
  for every empty lesson and saves them as **drafts** for the team to refine.
- **TACT Robot** ("Run supervision") cross-checks every agent's output for inconsistencies,
  says what's ready to publish vs blocked, and flags blind spots (agents that haven't run).
- Runs are still persisted to `admin_agent_reports` and browsable/filterable in Reports.

Redeploy the edge function (the `run_agent` task now accepts richer `context`):
`supabase functions deploy admin-ai --no-verify-jwt`.

### Round 6 (News · Mission · Notification agents)

Adds the three agents from `TACTIC_Academy_New_Agents_EN.pdf` to the pipeline, so it is now
**11 agents**:

```
1 Corpus → 2 Syllabus ┐
3 Performance → 4 User Model → 5 Recommendations → 6 Create
7 Marketing ──────────────────────────────────────────────┘
 9 News          (Corpus + User Model) ───────────────────┐
10 Mission       (Syllabus + Recommendations + Perf) ─────┼─ hand off to Create / Notification
11 Notification  (News + Marketing + User Model) ─────────┘
★ TACT Robot (supervisor) validates the output of ALL of the above
```

- **News** — picks the economic/financial events that matter, drafts a level-appropriate
  explainer for each, maps them to the domain/module they enrich, and flags the ones that
  need a user alert.
- **Mission** — turns concepts into missions/quests/simulations, ties difficulty to the
  performance signals, and specifies what to hand to **Create** for generation.
- **Notification** — turns News alerts + Marketing retention goals into a notification plan
  (audience, trigger, timing, channel) per learner segment, with GDPR / frequency-cap
  guardrails.
- **TACT Robot** now supervises these three as well.

**Scope of this round — plans only.** No SQL migration and no edge-function change (the
generic `run_agent` task already accepts arbitrary agent defs + context). What is *not* wired
yet, and needs a later migration + the mobile app:

- no live news feed (News reasons from generic recurring event types unless an admin pastes
  input into `context`);
- no `missions` table — Mission produces a structure to review, nothing persists it or
  triggers Create automatically;
- no send runtime — Notification outputs a plan; actual delivery, scheduling and frequency
  capping live in the mobile app;
- TACT supervision stays advisory — there is still no hard approve/reject gate that blocks a
  publication.

Redeploy is **not** required for this round (no edge-function change).

### Collaborator invite links (localhost:3000 issue)

Supabase **is** connected — the invite email sends fine. The link points at
`http://localhost:3000` because that's the project's **Site URL**. Fix it in the Supabase
dashboard → **Authentication → URL Configuration**: set **Site URL** to your deployed app
URL and add it (plus `/*`) under **Redirect URLs**. No code change required.

## Build status

Original 6 phases shipped, plus the feedback rounds above (through Round 6). `npm run build` is green.
