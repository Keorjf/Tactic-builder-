/**
 * Text-quality heuristics used by the Stats view.
 *
 * Pure functions — no React, no Supabase. Easy to unit-test if needed
 * later. All algorithms are deliberately simple; this is decision-support
 * for the admin, not academic NLP.
 */

// ─── Word / sentence / syllable counters ───────────────────────────────────

/** Strip HTML tags + `**bold**` markers used in legacy block bodies. */
export function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(s: string): number {
  const clean = stripMarkup(s);
  if (!clean) return 0;
  return clean.split(/\s+/).length;
}

export function sentenceCount(s: string): number {
  const clean = stripMarkup(s);
  if (!clean) return 0;
  const matches = clean.match(/[.!?]+(?=\s|$)/g);
  return Math.max(1, matches?.length ?? 1);
}

/**
 * Rough syllable estimator that handles French + English. Counts vowel
 * groups and applies a couple of common corrections. Not perfect, but
 * stable enough for the Flesch score to be meaningful at the lesson level.
 */
export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüÿœæç]/g, '');
  if (!w) return 0;
  // Each vowel cluster ≈ one syllable.
  const groups = w.match(/[aeiouyàâäéèêëîïôöùûüÿœæ]+/g);
  let n = groups?.length ?? 0;
  // Silent trailing 'e' (very common in French + English).
  if (/[^aeiouy]e$/.test(w)) n = Math.max(1, n - 1);
  return Math.max(1, n);
}

// ─── Flesch reading ease ────────────────────────────────────────────────────

/**
 * Flesch reading-ease score. Higher = easier.
 *  90+ very easy  · 60-70 standard · 30-50 difficult · < 30 very difficult
 *
 * Formula: 206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)
 */
export function flesch(text: string): number {
  const clean = stripMarkup(text);
  if (!clean) return 0;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const sentences = sentenceCount(clean);
  const syllables = words.reduce((acc, w) => acc + syllableCount(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function fleschBand(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 60) return { label: 'Easy', tone: 'good' };
  if (score >= 30) return { label: 'Standard', tone: 'warn' };
  return { label: 'Hard', tone: 'bad' };
}

// ─── Bloom's taxonomy (keyword heuristic) ──────────────────────────────────

const BLOOM_KEYWORDS: Record<string, string[]> = {
  Remember: ['definition', 'définit', 'is the', 'c\'est', 'rappelle', 'list', 'name', 'identify'],
  Understand: ['explain', 'explique', 'meaning', 'sens', 'why', 'pourquoi', 'compare', 'compare'],
  Apply: ['use', 'utilise', 'apply', 'applique', 'calculate', 'calcule', 'compute', 'example'],
  Analyze: ['analyse', 'analyze', 'breakdown', 'distingue', 'differentiate', 'because', 'cause'],
  Evaluate: ['evaluate', 'évalue', 'judge', 'critique', 'compare and', 'argue', 'justify', 'should'],
  Create: ['design', 'conçois', 'create', 'crée', 'compose', 'construct', 'build', 'plan a'],
};

const BLOOM_ORDER = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'] as const;

/** Returns the highest Bloom level whose keywords appear in the text. */
export function bloomLevel(text: string): typeof BLOOM_ORDER[number] {
  const t = stripMarkup(text).toLowerCase();
  let best: typeof BLOOM_ORDER[number] = 'Remember';
  for (const level of BLOOM_ORDER) {
    if (BLOOM_KEYWORDS[level].some((k) => t.includes(k))) {
      best = level;
    }
  }
  return best;
}

// ─── Misc formatting helpers ────────────────────────────────────────────────

export function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}
