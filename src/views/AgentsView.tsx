import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { useAnalytics } from '@/store/analytics';
import { computeCorpusHealth } from '@/lib/analytics';
import { aiRunAgent, type AgentDef, type AgentReport } from '@/lib/ai';
import { toast } from '@/components/Toast';
import Loader from '@/components/Loader';
import styles from './AgentsView.module.css';

const BUILTIN_AGENTS: AgentDef[] = [
  {
    id: 'corpus',
    label: 'Corpus Auditor',
    mission:
      'Audit the corpus for coherence, balance, and quality. Identify level/track distribution issues, duplicate or near-duplicate lessons, and coverage gaps.',
    tasks:
      '• Spot tracks that are too small or too large\n• Find lessons whose tag or level looks off\n• Flag duplicate names\n• Suggest 3 highest-leverage cleanups',
    constraints: 'Only use what is in CORPUS. Be specific (cite lesson IDs).',
    reportFormat:
      'findings = 5-8 concrete observations. sections = optional "Cleanup plan" with steps.',
    tone: 'professional',
  },
  {
    id: 'pedagogy',
    label: 'Pedagogy Reviewer',
    mission:
      'Review the corpus from a teaching-design lens. Flag lessons that are likely too hard or too easy, suggest where examples are missing, and propose a sensible learning order.',
    tasks:
      '• Identify lessons that probably need a hook or worked example\n• Propose a learning sequence inside each track\n• Surface concepts that need more reinforcement',
    constraints: 'Stay grounded in lesson names + tags + level.',
    reportFormat: 'findings + a "Learning sequence" section per track.',
    tone: 'narrative',
  },
  {
    id: 'gaps',
    label: 'Gap Hunter',
    mission:
      'Find missing topics — concepts a young French investor should know that are not yet covered in the corpus.',
    tasks:
      '• Propose 8 missing lesson topics with rationale\n• Group them by track if possible',
    constraints: 'Avoid topics already present in CORPUS.',
    reportFormat: 'lessons[] with { name, rationale } where rationale ≤ 140 chars.',
    tone: 'concise',
  },
  {
    id: 'translation',
    label: 'Translation Coach',
    mission:
      'Identify lessons most worth translating to EN and ES next, based on track and tag importance.',
    tasks:
      '• Rank the top 10 priorities for EN translation\n• Same for ES\n• Justify each pick in one short sentence',
    constraints: 'Use only lesson metadata in CORPUS.',
    reportFormat: 'Two sections: "EN priorities", "ES priorities" with bullet lists.',
    tone: 'professional',
  },
  {
    id: 'quality',
    label: 'Quality Inspector',
    mission:
      'Spot lessons whose name reads vague, sensationalist, or off-tone — and suggest sharper rewrites.',
    tasks:
      '• Identify 5-10 names to revise\n• Propose a sharper alternative for each',
    constraints: 'Preserve the educational angle. Stay in French.',
    reportFormat: 'sections: one "Before → After" item per finding.',
    tone: 'concise',
  },
  {
    id: 'engagement',
    label: 'Engagement Strategist',
    mission:
      'From the corpus and stats, suggest mechanics (streaks, missions, coin boosts) that would increase engagement.',
    tasks:
      '• Propose 5 mechanic tweaks\n• Estimate which lessons benefit most',
    constraints: 'Be specific; tie each suggestion to a real lesson or track when possible.',
    reportFormat: 'findings = mechanic ideas. sections = optional "Wins per track" with details.',
    tone: 'narrative',
  },
];

type RunState = {
  busy: boolean;
  report: AgentReport | null;
  error: string | null;
};

export default function AgentsView() {
  const loaded = useCorpus((s) => s.loaded);
  const loading = useCorpus((s) => s.loading);
  const load = useCorpus((s) => s.load);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);
  const analytics = useAnalytics();

  const [state, setState] = useState<Record<string, RunState>>({});
  const [active, setActive] = useState<string>(BUILTIN_AGENTS[0].id);

  useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);

  useEffect(() => {
    if (!analytics.loaded && !analytics.loading) void analytics.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const corpusContext = useMemo(() => {
    const health = computeCorpusHealth(lessons, tracks);
    return {
      stats: {
        total: health.total,
        published: health.published,
        drafts: health.drafts,
        tracks: health.trackCount,
        byLevel: health.byLevel,
        byTag: health.byTag.slice(0, 12),
        gapsNoContent: health.gaps.noContent.length,
        gapsNoQuiz: health.gaps.noQuiz.length,
        totalUsers: analytics.counts?.total_users ?? 0,
        completions: analytics.counts?.total_completions ?? 0,
      },
      lessons: lessons.map((l) => {
        const t = tracks.find((tr) => tr.id === l.trackId);
        return {
          id: l.id,
          name: l.name,
          level: l.level,
          track: t ? `${t.emoji} ${t.nameFr}` : '—',
          tag: l.tag,
        };
      }),
    };
  }, [lessons, tracks, analytics.counts]);

  const runAgent = async (def: AgentDef) => {
    setState((s) => ({ ...s, [def.id]: { busy: true, report: null, error: null } }));
    const res = await aiRunAgent({ agent: def, corpus: corpusContext });
    if (!res.ok) {
      setState((s) => ({ ...s, [def.id]: { busy: false, report: null, error: res.error } }));
      toast(`${def.label} failed: ${res.error}`, 'error');
      return;
    }
    setState((s) => ({ ...s, [def.id]: { busy: false, report: res.data, error: null } }));
    toast(`${def.label} finished.`, 'success');
  };

  const activeDef = BUILTIN_AGENTS.find((a) => a.id === active) ?? BUILTIN_AGENTS[0];
  const activeState = state[active];

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>AI Agents</h1>
        <p className={styles.sub}>
          Run a focused analysis over your live corpus. Each agent has a defined mission, tone, and
          report format.
        </p>
      </div>

      <div className={styles.body}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          {BUILTIN_AGENTS.map((a) => {
            const s = state[a.id];
            return (
              <button
                key={a.id}
                className={`${styles.agentTab} ${active === a.id ? styles.agentTabActive : ''}`}
                onClick={() => setActive(a.id)}
              >
                <div className={styles.agentName}>{a.label}</div>
                <div className={styles.agentMission}>
                  {a.mission.length > 70 ? `${a.mission.slice(0, 70)}…` : a.mission}
                </div>
                <div className={styles.agentStatus}>
                  {s?.busy
                    ? '⏳ running…'
                    : s?.report
                    ? `✓ ${s.report.findings?.length ?? 0} findings`
                    : '— idle'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className={styles.detail}>
          <div className={styles.detailHead}>
            <div>
              <div className={styles.detailTitle}>{activeDef.label}</div>
              <div className={styles.detailMission}>{activeDef.mission}</div>
            </div>
            <button
              className={styles.runBtn}
              onClick={() => void runAgent(activeDef)}
              disabled={activeState?.busy}
            >
              {activeState?.busy ? 'Running…' : '▶ Run agent'}
            </button>
          </div>

          {activeState?.busy ? <Loader label="Analyzing the corpus…" /> : null}

          {activeState?.error ? (
            <div className={styles.error}>Error: {activeState.error}</div>
          ) : null}

          {activeState?.report ? (
            <Report report={activeState.report} />
          ) : !activeState?.busy ? (
            <div className={styles.empty}>
              Click <strong>Run agent</strong> to send the live corpus to OpenAI and see findings here.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Report({ report }: { report: AgentReport }) {
  return (
    <div className={styles.report}>
      {report.findings?.length ? (
        <div className={styles.reportSection}>
          <div className={styles.reportTitle}>Findings</div>
          <ul className={styles.findingList}>
            {report.findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.sections?.length ? (
        <div className={styles.reportSection}>
          {report.sections.map((s, i) => (
            <div key={i} className={styles.subSection}>
              <div className={styles.subTitle}>{s.title}</div>
              <div className={styles.subContent}>{s.content}</div>
            </div>
          ))}
        </div>
      ) : null}

      {report.lessons?.length ? (
        <div className={styles.reportSection}>
          <div className={styles.reportTitle}>Lessons</div>
          <div className={styles.lessonGrid}>
            {report.lessons.map((l, i) => (
              <div key={i} className={styles.lessonCard}>
                <div className={styles.lessonName}>{l.name}</div>
                <div className={styles.lessonRationale}>{l.rationale}</div>
                {l.id ? <div className={styles.lessonId}>id: {l.id}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
