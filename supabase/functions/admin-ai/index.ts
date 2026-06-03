// =========================================================================
// ADMIN-AI — multiplexed OpenAI proxy for the Corpus Builder
//
// One Supabase Edge Function endpoint, keyed by a `task` field.
// Admin-gated: the function verifies the caller's JWT and checks
// public.is_admin() before doing any work. Keeps the OpenAI API key off
// the browser bundle (same pattern as tact-chat).
//
// Tasks:
//   generate_content  — draft lesson blocks + quiz from {name,level,tag,track}
//   translate         — FR lesson body → EN and/or ES
//   lesson_ideas      — propose lesson titles for a level/theme
//   module_ideas      — propose track names for a level
//   run_agent         — run a named admin "agent" against trimmed corpus context
//   marketing         — marketing copy from corpus stats
//
// Deploy:
//   supabase functions deploy admin-ai --no-verify-jwt
//   (secrets OPENAI_API_KEY / OPENAI_MODEL already set for tact-chat)
// =========================================================================

// deno-lint-ignore-file no-explicit-any
import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

type Block = { type: 'hook' | 'content' | 'tip' | 'trap' | 'real' | 'info'; emo?: string; title?: string; text: string };
type Quiz = { q: string; opts: string[]; correct: number; expl: string };

type GenerateContentBody = {
  task: 'generate_content';
  lesson: { name: string; level: string; tag: string; track?: string; duration?: string };
};
type TranslateBody = {
  task: 'translate';
  langs: ('en' | 'es')[];
  lesson: { title: string; blocks: Block[]; quizzes: Quiz[] };
};
type LessonIdeasBody = {
  task: 'lesson_ideas';
  level: string;
  theme?: string;
  existing?: string[];
};
type ModuleIdeasBody = {
  task: 'module_ideas';
  level: string;
  existing?: string[];
};
type RunAgentBody = {
  task: 'run_agent';
  agent: {
    id: string;
    label: string;
    mission: string;
    tasks?: string;
    constraints?: string;
    reportFormat?: string;
    tone?: string;
  };
  corpus: {
    stats: Record<string, unknown>;
    lessons: { id: string; name: string; level: string; track?: string; tag?: string }[];
  };
};
type MarketingBody = {
  task: 'marketing';
  corpusStats: Record<string, unknown>;
  audience?: string;
  goal?: string;
};

type Body =
  | GenerateContentBody
  | TranslateBody
  | LessonIdeasBody
  | ModuleIdeasBody
  | RunAgentBody
  | MarketingBody;

async function gateAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: 'Server not configured' };
  }
  if (!authHeader) return { ok: false, status: 401, error: 'Not signed in' };

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await sb.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { ok: false, status: 401, error: 'Not signed in' };

  const { data: row } = await sb
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!row || (row as { role?: string }).role !== 'admin') {
    return { ok: false, status: 403, error: 'Admin role required' };
  }
  return { ok: true, userId };
}

// ─── Prompt builders ──────────────────────────────────────────────────────

function generateContentPrompt(b: GenerateContentBody): { system: string; user: string } {
  const system = `You are TACTIC's pedagogical content engine. You write concise, accurate, slightly playful French financial-education lessons aimed at young adult investors.

OUTPUT STRICT JSON — no prose around it. Schema:
{
  "blocks": [
    { "type": "hook"|"content"|"tip"|"trap", "emo": string, "title"?: string, "text": string }
  ],
  "quiz": { "q": string, "opts": [string,string,string,string], "correct": number, "expl": string }
}

RULES
- All text in French.
- 1 hook + 1 content + 1 tip + optional 1 trap. Keep each block ≤ 600 chars.
- Use simple, vivid language. **Bold** key terms with **double asterisks** (not HTML).
- Quiz: 4 plausible options, 1 correct, "correct" is the 0-based index.
- Explanation references the correct concept in ≤ 2 sentences.
- Do NOT name famous investors. Do NOT prescribe real-money advice.`;
  const user = `LESSON META:
- name: ${b.lesson.name}
- level: ${b.lesson.level}
- tag: ${b.lesson.tag}
- track: ${b.lesson.track ?? '—'}
- duration: ${b.lesson.duration ?? '1 min'}

Write the lesson now. JSON only.`;
  return { system, user };
}

function translatePrompt(b: TranslateBody): { system: string; user: string } {
  const targets = b.langs.includes('en') && b.langs.includes('es')
    ? '"en" and "es"'
    : b.langs[0] === 'en'
    ? '"en"'
    : '"es"';
  const system = `You translate TACTIC pedagogical lessons from French to ${b.langs.includes('en') ? 'English' : ''}${b.langs.includes('en') && b.langs.includes('es') ? ' and ' : ''}${b.langs.includes('es') ? 'Spanish' : ''}, preserving meaning, pedagogical tone, **bold** markers, and emoji.

OUTPUT STRICT JSON. Schema:
{
  ${b.langs.includes('en') ? '"en": { "title": string, "blocks": [...same shape...], "quizzes": [...] }' : ''}${b.langs.includes('en') && b.langs.includes('es') ? ',\n  ' : ''}${b.langs.includes('es') ? '"es": { "title": string, "blocks": [...], "quizzes": [...] }' : ''}
}

RULES
- Translate "text", "title", "q", "opts", "expl" — keep "type", "emo", "correct" indices, structure identical.
- Keep **bold** markers verbatim around the corresponding translated term.
- Don't add or remove blocks or quiz options.`;
  const user = `Translate to ${targets}:\n\n${JSON.stringify(b.lesson)}`;
  return { system, user };
}

function lessonIdeasPrompt(b: LessonIdeasBody): { system: string; user: string } {
  const system = `You suggest TACTIC lesson titles. Output STRICT JSON:
{ "ideas": [ { "emoji": string, "name": string, "tag": string, "why": string } ] }
- 6 ideas, all in French.
- Each "name" ≤ 80 chars, catchy, descriptive.
- "tag" is one of: Base, Stratégie, Pratique, Analyse, Psychologie, Fiscalité, Vocab, ETF, Crypto, Immo, Macro, Retraite, Expert, Dérivés, Risque.
- "why" ≤ 120 chars rationale.
- Avoid topics already in EXISTING.`;
  const user = `LEVEL: ${b.level}
${b.theme ? `THEME: ${b.theme}` : ''}
EXISTING: ${(b.existing ?? []).slice(0, 80).join('; ') || '(none)'}`;
  return { system, user };
}

function moduleIdeasPrompt(b: ModuleIdeasBody): { system: string; user: string } {
  const system = `You suggest TACTIC tracks (modules) — coherent groups of ~5-10 lessons. Output STRICT JSON:
{ "ideas": [ { "emoji": string, "name": string, "why": string } ] }
- 6 ideas, French.
- "name" ≤ 50 chars, no leading emoji (emoji is separate).
- "why" ≤ 140 chars, what the module covers.
- Avoid duplicates with EXISTING.`;
  const user = `LEVEL: ${b.level}
EXISTING: ${(b.existing ?? []).slice(0, 40).join('; ') || '(none)'}`;
  return { system, user };
}

function runAgentPrompt(b: RunAgentBody): { system: string; user: string } {
  const tone = b.agent.tone || 'professional';
  const system = `You are "${b.agent.label}", an analytical agent inside the TACTIC Corpus Builder admin panel.

MISSION
${b.agent.mission}

TONE: ${tone}.

OUTPUT STRICT JSON. Schema:
{
  "findings":   [ string ],                                       // 3-8 bullet-style observations
  "sections":   [ { "title": string, "content": string } ]?,      // optional deeper sections
  "lessons":    [ { "id"?: string, "name": string, "rationale": string } ]?
}

RULES
- Findings are concrete, evidence-based statements derived from CORPUS.
- Don't invent lessons that aren't in CORPUS unless the mission explicitly asks for proposals.
- ≤ 8 findings. ≤ 4 sections.`;
  const user = `TASKS:
${b.agent.tasks || '(none specified)'}

CONSTRAINTS:
${b.agent.constraints || '(none)'}

REPORT FORMAT:
${b.agent.reportFormat || 'JSON as specified above.'}

CORPUS STATS:
${JSON.stringify(b.corpus.stats)}

CORPUS LESSONS (sample, trimmed to id/name/level/track/tag):
${JSON.stringify(b.corpus.lessons.slice(0, 80))}

Run the analysis now. JSON only.`;
  return { system, user };
}

function marketingPrompt(b: MarketingBody): { system: string; user: string } {
  const system = `You write punchy marketing copy for TACTIC, a gamified French financial-education app for young adult investors.

OUTPUT STRICT JSON:
{
  "headlines": [ string ],          // 5, ≤ 70 chars
  "social_posts": [ string ],       // 3, ≤ 240 chars, French, no hashtags spam
  "value_props": [ string ],        // 5 short bullets
  "cta": string                     // ≤ 40 chars
}`;
  const user = `AUDIENCE: ${b.audience ?? 'Young adult investors in France'}
GOAL: ${b.goal ?? 'Drive signups for the app'}

CORPUS STATS (use to make claims concrete, e.g. lesson counts):
${JSON.stringify(b.corpusStats)}`;
  return { system, user };
}

// ─── OpenAI call ──────────────────────────────────────────────────────────

async function callOpenAI(system: string, user: string, model: string, apiKey: string, maxTokens = 1400): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('OpenAI error', res.status, errText);
    throw new Error(`OpenAI ${res.status}`);
  }
  const data: any = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error('OpenAI returned non-JSON:', content.slice(0, 400));
    throw new Error('Bad JSON from model');
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const gate = await gateAdmin(req);
  if (!gate.ok) return json({ ok: false, error: gate.error }, { status: gate.status });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json({ ok: false, error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

  try {
    let prompt: { system: string; user: string };
    let maxTokens = 1400;

    switch (body.task) {
      case 'generate_content':
        prompt = generateContentPrompt(body);
        break;
      case 'translate':
        prompt = translatePrompt(body);
        maxTokens = 2400;
        break;
      case 'lesson_ideas':
        prompt = lessonIdeasPrompt(body);
        maxTokens = 900;
        break;
      case 'module_ideas':
        prompt = moduleIdeasPrompt(body);
        maxTokens = 700;
        break;
      case 'run_agent':
        prompt = runAgentPrompt(body);
        maxTokens = 1800;
        break;
      case 'marketing':
        prompt = marketingPrompt(body);
        maxTokens = 1000;
        break;
      default:
        return json({ ok: false, error: 'Unknown task' }, { status: 400 });
    }

    const data = await callOpenAI(prompt.system, prompt.user, model, apiKey, maxTokens);
    return json({ ok: true, data });
  } catch (err) {
    console.error('admin-ai error', err);
    return json({ ok: false, error: (err as Error).message || 'AI request failed' }, { status: 502 });
  }
});
