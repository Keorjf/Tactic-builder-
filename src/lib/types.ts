/**
 * Shared domain types for the Corpus Builder.
 *
 * These mirror the legacy admin model and stay compatible with the mobile
 * app's `Lesson`/`Block`/`Quiz` shape so the corpus can be consumed by both.
 */

// ─── Auth / roles ──────────────────────────────────────────────────────────

export type AdminRole = 'learner' | 'ux' | 'ped' | 'data' | 'admin';

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AdminRole;
};

// ─── Lesson levels / blocks / quizzes ─────────────────────────────────────

/** Stored in French to match the legacy corpus + mobile data. */
export type Level = 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert';

export const LEVELS: Level[] = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];

export type BlockType = 'hook' | 'content' | 'tip' | 'trap' | 'real' | 'info';

export type Block = {
  type: BlockType;
  /** Body text. Legacy used `text`; mobile uses `body`. We standardise on `text`
   *  in the admin and map to `body` when exporting to the app. */
  text: string;
  emo?: string;
  title?: string;
};

export type Quiz = {
  q: string;
  opts: string[];
  /** Index into `opts` of the correct answer. */
  correct: number;
  expl: string;
};

/** Per-language translation payload for a lesson. */
export type Translation = {
  title?: string;
  blocks?: Block[];
  quizzes?: Quiz[];
};

export type LessonStatus = 'draft' | 'published';

// ─── Tracks ────────────────────────────────────────────────────────────────

// ─── Domains (top-level taxonomy: Domain → Module → Lesson) ───────────────

export type Domain = {
  id: string;
  code?: string;
  name: string;
  emoji: string;
  objective?: string;
  sortOrder: number;
};

export type Track = {
  id: string;
  emoji: string;
  nameFr: string;
  nameEn?: string;
  level: Level;
  sortOrder: number;
  /** Optional theme for the whole track (mirrors per-lesson themes). */
  theme?: string;
  /** The domain this module belongs to. */
  domainId?: string | null;
  /** The module's core question (from the syllabus). */
  coreQuestion?: string;
};

// ─── Lessons ───────────────────────────────────────────────────────────────

export type Lesson = {
  id: string;
  trackId: string | null;
  emoji: string;
  name: string;
  duration: string;
  coins: number;
  xp: number;
  tag: string;
  level: Level;
  /** Short course summary captured while authoring. */
  summary?: string;
  blocks: Block[];
  quizzes: Quiz[];
  translations: Partial<Record<'en' | 'es', Translation>>;
  status: LessonStatus;
  createdAt?: string;
  updatedAt?: string;
};

// ─── Resources ─────────────────────────────────────────────────────────────

export type ResourceKind =
  | 'youtube'
  | 'pdf'
  | 'link'
  | 'image'
  | 'audio'
  | 'article'
  | 'idea'
  | 'syllabus';

export const RESOURCE_KINDS: ResourceKind[] = [
  'pdf',
  'youtube',
  'link',
  'image',
  'audio',
  'article',
  'idea',
];

export type Resource = {
  id: string;
  kind: ResourceKind;
  title: string;
  url: string;
  lessonId?: string | null;
  trackId?: string | null;
  createdAt?: string;
};

// ─── Agent report history ──────────────────────────────────────────────────

export type AgentReportStatus = 'new' | 'in_progress' | 'done' | 'archived';

export const AGENT_REPORT_STATUSES: AgentReportStatus[] = [
  'new',
  'in_progress',
  'done',
  'archived',
];

/** A persisted AI-agent run, stored in `admin_agent_reports`. */
export type AgentReportRecord = {
  id: string;
  agentId: string;
  agentLabel: string;
  status: AgentReportStatus;
  report: {
    findings?: string[];
    sections?: { title: string; content: string }[];
    lessons?: { id?: string; name: string; rationale: string }[];
  };
  createdBy?: string | null;
  createdAt: string;
  updatedAt?: string;
};

// ─── Marketing ─────────────────────────────────────────────────────────────

export type CampaignStatus = 'planned' | 'active' | 'paused' | 'done';

export const CAMPAIGN_CHANNELS = [
  'Meta',
  'Google',
  'TikTok',
  'Email',
  'Influencer',
  'Organic',
  'Other',
] as const;

export type MarketingCampaign = {
  id: string;
  name: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  startDate?: string | null;
  endDate?: string | null;
  status: CampaignStatus;
  createdAt?: string;
};

export type MarketingKpis = {
  totalSpend: number;
  totalRevenue: number;
  totalClicks: number;
  totalConversions: number;
  totalImpressions: number;
  roi: number;
  cac: number;
  conversionRate: number;
  campaigns: number;
};

// ─── Admin & permissions ───────────────────────────────────────────────────

export type Member = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AdminRole;
  createdAt?: string;
};

export const ADMIN_ROLES: AdminRole[] = ['learner', 'ux', 'ped', 'data', 'admin'];

export const ROLE_LABELS: Record<AdminRole, string> = {
  learner: 'Learner',
  ux: 'UX',
  ped: 'Pedagogy',
  data: 'Data',
  admin: 'Admin',
};

export type AuditEntry = {
  id: string;
  actorEmail: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

// ─── Tag options (from the legacy editor's <select>) ──────────────────────

export const TAGS = [
  'Core',
  'Strategy',
  'Practice',
  'Analysis',
  'Psychology',
  'Tax',
  'Vocab',
  'ETF',
  'Crypto',
  'Real Estate',
  'Macro',
  'Retirement',
  'Expert',
  'Derivatives',
  'Risk',
] as const;
