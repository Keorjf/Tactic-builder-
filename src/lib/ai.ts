/**
 * Client wrappers around the `admin-ai` Supabase edge function.
 *
 * Every call goes through `supabase.functions.invoke('admin-ai', ...)`,
 * which automatically attaches the caller's JWT — the function rejects
 * non-admins. The OpenAI key never touches the browser bundle.
 */

import { supabase } from '@/lib/supabase';
import type { Block, Quiz, Translation } from '@/lib/types';

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function invoke<T>(body: Record<string, unknown>): Promise<AiResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-ai', { body });
    if (error) {
      return { ok: false, error: error.message ?? 'admin-ai call failed' };
    }
    if (data && typeof data === 'object' && (data as any).ok === true) {
      return { ok: true, data: (data as any).data as T };
    }
    return {
      ok: false,
      error: (data as any)?.error ?? 'admin-ai returned an unexpected payload',
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Network error' };
  }
}

// ─── generate_content ─────────────────────────────────────────────────────

export type GeneratedContent = {
  blocks: Block[];
  quiz: Quiz;
};

export function aiGenerateContent(input: {
  name: string;
  level: string;
  tag: string;
  track?: string;
  duration?: string;
}): Promise<AiResult<GeneratedContent>> {
  return invoke<GeneratedContent>({ task: 'generate_content', lesson: input });
}

// ─── translate ────────────────────────────────────────────────────────────

export type TranslatePayload = {
  en?: Translation;
  es?: Translation;
};

export function aiTranslate(input: {
  langs: ('en' | 'es')[];
  lesson: { title: string; blocks: Block[]; quizzes: Quiz[] };
}): Promise<AiResult<TranslatePayload>> {
  return invoke<TranslatePayload>({ task: 'translate', ...input });
}

// ─── ideas ────────────────────────────────────────────────────────────────

export type LessonIdea = { emoji: string; name: string; tag: string; why: string; summary?: string };
export type ModuleIdea = { emoji: string; name: string; why: string };

export function aiLessonIdeas(input: {
  level: string;
  theme?: string;
  existing?: string[];
}): Promise<AiResult<{ ideas: LessonIdea[] }>> {
  return invoke({ task: 'lesson_ideas', ...input });
}

/** Generate lesson drafts from the course syllabus text. */
export function aiSyllabusLessons(input: {
  level: string;
  syllabus: string;
  existing?: string[];
}): Promise<AiResult<{ ideas: LessonIdea[] }>> {
  return invoke({ task: 'syllabus_lessons', ...input });
}

export function aiModuleIdeas(input: {
  level: string;
  existing?: string[];
}): Promise<AiResult<{ ideas: ModuleIdea[] }>> {
  return invoke({ task: 'module_ideas', ...input });
}

// ─── agents ───────────────────────────────────────────────────────────────

export type AgentReport = {
  findings: string[];
  sections?: { title: string; content: string }[];
  lessons?: { id?: string; name: string; rationale: string }[];
};

export type AgentDef = {
  id: string;
  label: string;
  mission: string;
  tasks?: string;
  constraints?: string;
  reportFormat?: string;
  tone?: 'professional' | 'concise' | 'technical' | 'narrative';
  /** Ids of agents whose latest output this agent consumes. */
  dependsOn?: string[];
};

export function aiRunAgent(input: {
  agent: AgentDef;
  corpus?: {
    stats: Record<string, unknown>;
    lessons: { id: string; name: string; level: string; track?: string; tag?: string }[];
  };
  /** Arbitrary extra context (performance, syllabus coverage, upstream reports…). */
  context?: Record<string, unknown>;
}): Promise<AiResult<AgentReport>> {
  return invoke<AgentReport>({ task: 'run_agent', ...input });
}

// ─── marketing ────────────────────────────────────────────────────────────

export type MarketingCopy = {
  headlines: string[];
  social_posts: string[];
  value_props: string[];
  cta: string;
};

export function aiMarketing(input: {
  corpusStats: Record<string, unknown>;
  audience?: string;
  goal?: string;
}): Promise<AiResult<MarketingCopy>> {
  return invoke<MarketingCopy>({ task: 'marketing', ...input });
}

// ─── invite (admin panel) ─────────────────────────────────────────────────

export function aiInvite(input: {
  email: string;
  role: string;
}): Promise<AiResult<{ invited: string }>> {
  return invoke<{ invited: string }>({ task: 'invite', ...input });
}

// ─── Robot Tact assistant ─────────────────────────────────────────────────

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export function aiAssistant(input: {
  message: string;
  history?: ChatTurn[];
  context?: Record<string, unknown>;
}): Promise<AiResult<{ reply: string }>> {
  return invoke<{ reply: string }>({ task: 'assistant', ...input });
}
