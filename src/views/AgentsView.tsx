import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { useAnalytics } from '@/store/analytics';
import { computeCorpusHealth } from '@/lib/analytics';
import { aiRunAgent, aiGenerateContent, type AgentDef, type AgentReport } from '@/lib/ai';
import { fetchMarketingKpis } from '@/lib/marketing';
import { fetchRetention, fetchLessonTime } from '@/lib/events';
import { SYLLABUS, SYLLABUS_TOTALS, domainId } from '@/lib/syllabus';
import {
  fetchReports,
  saveReport,
  setReportStatus,
  deleteReport,
} from '@/lib/reports';
import { corpusErrorMessage } from '@/lib/corpus';
import {
  AGENT_REPORT_STATUSES,
  type AgentReportRecord,
  type AgentReportStatus,
} from '@/lib/types';
import { toast } from '@/components/Toast';
import Loader from '@/components/Loader';
import styles from './AgentsView.module.css';

/**
 * The supervised agent pipeline. Agents feed each other (dependsOn) and the
 * TACT Robot supervises/validates every output before publishing:
 *
 *   Corpus → Syllabus ┐
 *   Performance → User Model → Recommendations → Create
 *   Marketing ────────────────────────────────────────┘
 *   TACT (supervisor) validates ALL of the above.
 */
const BUILTIN_AGENTS: AgentDef[] = [
  {
    id: 'corpus',
    label: '1 · Corpus',
    mission:
      'Audit the existing corpus (lessons + modules + domains) for coherence, balance, duplicates, and coverage gaps. The factual baseline every other agent builds on.',
    tasks:
      '• Flag thin/oversized modules and empty domains\n• Find duplicate or mis-tagged lessons\n• Summarize what exists vs. what is still a draft/empty',
    constraints: 'Use only CORPUS. Cite lesson/module ids.',
    reportFormat: 'findings = 5-8 observations. sections = optional "Cleanup plan".',
    tone: 'professional',
    dependsOn: [],
  },
  {
    id: 'syllabus',
    label: '2 · Syllabus',
    mission:
      'Compare the corpus against the official TACTIC syllabus (Domain → Module → Lesson). Report coverage per domain/module and exactly what is missing or content-less.',
    tasks:
      '• Per domain: expected vs actual modules/lessons, % with real content\n• List modules that are only titles (need content)\n• Recommend the build order to reach full coverage',
    constraints: 'Use the SYLLABUS coverage block in CONTEXT. Be precise with numbers.',
    reportFormat: 'findings = coverage insights. sections = "Build order". lessons = modules to fill.',
    tone: 'professional',
    dependsOn: ['corpus'],
  },
  {
    id: 'performance',
    label: '3 · Performance',
    mission:
      'Analyze learning analytics — completions, hardest lessons, retention, time-on-lesson, drop-off — to find the least-performing courses and modules that need improvement.',
    tasks:
      '• Rank lowest-performing lessons/modules\n• Surface retention + drop-off signals\n• Recommend which content to fix first',
    constraints:
      'Use the PERFORMANCE block in CONTEXT. If event data is sparse, say so and work with what exists.',
    reportFormat: 'findings = performance insights with numbers. sections = "Needs improvement".',
    tone: 'technical',
    dependsOn: [],
  },
  {
    id: 'user_model',
    label: '4 · User Model',
    mission:
      'Build learner segments/personas and their needs from performance signals (and feedback when available) — who is learning, where they struggle, what they need next.',
    tasks:
      '• Define 3-5 learner segments\n• For each: strengths, struggles, recommended next content\n• Note any missing data needed to model users better',
    constraints: 'Base segments on the PERFORMANCE output in CONTEXT. Be explicit about assumptions.',
    reportFormat: 'sections = one per segment. findings = cross-cutting needs.',
    tone: 'narrative',
    dependsOn: ['performance'],
  },
  {
    id: 'recommendations',
    label: '5 · Recommendations',
    mission:
      'Combine the User Model and Syllabus coverage into a prioritized weekly action plan: what to create, fix, and improve to move the corpus forward.',
    tasks:
      '• Prioritized recommendations (highest leverage first)\n• Content gaps to close\n• A concrete weekly action plan',
    constraints: 'Ground every item in the UPSTREAM reports (user_model + syllabus) in CONTEXT.',
    reportFormat:
      'findings = prioritized recommendations. sections = "Content gaps", "Weekly action plan".',
    tone: 'professional',
    dependsOn: ['user_model', 'syllabus'],
  },
  {
    id: 'create',
    label: '6 · Create',
    mission:
      'Turn recommendations + the syllabus into actual course content. Plan what to generate, then produce draft lessons (blocks + quiz) for the team to refine.',
    tasks:
      '• Propose which modules/lessons to generate next and why\n• Outline the structure each lesson should follow',
    constraints: 'Use CORPUS + the recommendations UPSTREAM report. Generation produces DRAFTS only.',
    reportFormat: 'findings = creation plan. lessons = lessons to generate next.',
    tone: 'professional',
    dependsOn: ['corpus', 'recommendations'],
  },
  {
    id: 'marketing',
    label: '7 · Marketing',
    mission:
      'Analyze marketing performance (ROI, CAC, channels, budget) and correlate it with corpus/learning performance to guide spend and what to promote.',
    tasks:
      '• Rank channels by ROI/conversion\n• Recommend budget re-allocation\n• Tie momentum to corpus strengths',
    constraints: 'Use the MARKETING + PERFORMANCE blocks in CONTEXT.',
    reportFormat: 'findings = insights with numbers. sections = "Budget", "Marketing ↔ corpus".',
    tone: 'professional',
    dependsOn: ['performance'],
  },
  {
    id: 'tact',
    label: '★ TACT Robot (Supervisor)',
    mission:
      'The central brain. Validate and synthesize EVERY other agent\'s output: detect inconsistencies and errors, confirm what is ready to publish, and issue the global supervision verdict and recommendations.',
    tasks:
      '• Cross-check the upstream reports for contradictions or gaps\n• Flag anything not safe to publish yet\n• Produce a single prioritized supervision verdict',
    constraints:
      'Use the UPSTREAM reports of all agents in CONTEXT. If an agent has not run, note it as a blind spot.',
    reportFormat:
      'findings = supervision verdict. sections = "Ready to publish", "Blocked / needs review", "Blind spots".',
    tone: 'professional',
    dependsOn: ['corpus', 'syllabus', 'performance', 'user_model', 'recommendations', 'create', 'marketing'],
  },
];

const AGENT_LABEL = new Map(BUILTIN_AGENTS.map((a) => [a.id, a.label]));

type RunState = { busy: boolean; report: AgentReport | null; error: string | null };
type SubTab = 'agents' | 'reports';

export default function AgentsView() {
  const loaded = useCorpus((s) => s.loaded);
  const loading = useCorpus((s) => s.loading);
  const load = useCorpus((s) => s.load);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);
  const analytics = useAnalytics();

  const [tab, setTab] = useState<SubTab>('agents');
  const [state, setState] = useState<Record<string, RunState>>({});
  const [active, setActive] = useState<string>(BUILTIN_AGENTS[0].id);
  const [marketing, setMarketing] = useState<Record<string, unknown> | null>(null);
  const [perfExtra, setPerfExtra] = useState<Record<string, unknown>>({});

  const [reports, setReports] = useState<AgentReportRecord[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);

  useEffect(() => {
    if (!analytics.loaded && !analytics.loading) void analytics.load();
    fetchMarketingKpis().then((k) => setMarketing(k as Record<string, unknown> | null)).catch(() => {});
    Promise.all([fetchRetention().catch(() => null), fetchLessonTime(10).catch(() => null)]).then(
      ([retention, lessonTime]) => setPerfExtra({ retention, lessonTime })
    );
    // Load history so dependency outputs are available immediately.
    void refreshReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshReports = async () => {
    try {
      const rows = await fetchReports();
      setReports(rows);
      setReportsLoaded(true);
    } catch (err) {
      toast(corpusErrorMessage(err), 'error');
    }
  };

  useEffect(() => {
    if (tab === 'reports' && !reportsLoaded) void refreshReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Shared context the agents consume ────────────────────────────────────
  const corpusContext = useMemo(() => {
    const health = computeCorpusHealth(lessons, tracks);
    return {
      stats: {
        total: health.total,
        published: health.published,
        drafts: health.drafts,
        tracks: health.trackCount,
        byTag: health.byTag.slice(0, 12),
        gapsNoContent: health.gaps.noContent.length,
        gapsNoQuiz: health.gaps.noQuiz.length,
      },
      lessons: lessons.map((l) => {
        const t = tracks.find((tr) => tr.id === l.trackId);
        return { id: l.id, name: l.name, level: l.level, track: t?.nameFr ?? '—', tag: l.tag };
      }),
    };
  }, [lessons, tracks]);

  const syllabusCoverage = useMemo(() => {
    const byDomain = SYLLABUS.map((d) => {
      const did = domainId(d.code);
      const dTracks = tracks.filter((t) => t.domainId === did);
      const tIds = new Set(dTracks.map((t) => t.id));
      const dLessons = lessons.filter((l) => tIds.has(l.trackId ?? ''));
      const expectedLessons = d.modules.reduce((n, m) => n + m.lessons.length, 0);
      return {
        domain: `${d.code} - ${d.name}`,
        expectedModules: d.modules.length,
        actualModules: dTracks.length,
        expectedLessons,
        actualLessons: dLessons.length,
        withContent: dLessons.filter((l) => l.blocks.length > 0).length,
        drafts: dLessons.filter((l) => l.status === 'draft').length,
      };
    });
    return { totals: SYLLABUS_TOTALS, byDomain };
  }, [tracks, lessons]);

  const performanceContext = useMemo(
    () => ({
      totalUsers: analytics.counts?.total_users ?? 0,
      completions: analytics.counts?.total_completions ?? 0,
      activeStreakers: analytics.counts?.active_streakers ?? 0,
      topCompleted: analytics.topCompleted.slice(0, 10),
      hardest: analytics.hardest.slice(0, 10),
      ...perfExtra,
    }),
    [analytics.counts, analytics.topCompleted, analytics.hardest, perfExtra]
  );

  // Latest report per agent (in-session run wins over persisted history).
  const latestByAgent = useMemo(() => {
    const map: Record<string, AgentReport> = {};
    for (const r of [...reports].reverse()) map[r.agentId] = r.report as AgentReport;
    for (const [id, s] of Object.entries(state)) if (s.report) map[id] = s.report;
    return map;
  }, [reports, state]);

  const upstreamFor = (deps: string[]) => {
    const out: Record<string, unknown> = {};
    for (const id of deps) {
      const r = latestByAgent[id];
      if (r) out[id] = { findings: r.findings?.slice(0, 8), sections: r.sections };
    }
    return out;
  };

  const buildPayload = (agent: AgentDef) => {
    const ctx: Record<string, unknown> = {};
    if (agent.dependsOn?.length) ctx.upstream = upstreamFor(agent.dependsOn);
    if (['performance', 'user_model', 'recommendations', 'marketing', 'tact'].includes(agent.id))
      ctx.performance = performanceContext;
    if (['syllabus', 'recommendations', 'create', 'tact'].includes(agent.id))
      ctx.syllabus = syllabusCoverage;
    if (['marketing', 'tact'].includes(agent.id)) ctx.marketing = marketing ?? 'no marketing data';
    const corpus = ['corpus', 'syllabus', 'create', 'tact'].includes(agent.id)
      ? corpusContext
      : undefined;
    return { corpus, context: Object.keys(ctx).length ? ctx : undefined };
  };

  const runAgent = async (def: AgentDef) => {
    setState((s) => ({ ...s, [def.id]: { busy: true, report: null, error: null } }));
    const { corpus, context } = buildPayload(def);
    const res = await aiRunAgent({ agent: def, corpus, context });
    if (!res.ok) {
      setState((s) => ({ ...s, [def.id]: { busy: false, report: null, error: res.error } }));
      toast(`${def.label} failed: ${res.error}`, 'error');
      return;
    }
    setState((s) => ({ ...s, [def.id]: { busy: false, report: res.data, error: null } }));
    try {
      const saved = await saveReport({ agentId: def.id, agentLabel: def.label, report: res.data });
      setReports((r) => [saved, ...r]);
      toast(`${def.label} finished — saved.`, 'success');
    } catch {
      toast(`${def.label} finished (report not saved).`, 'info');
    }
  };

  const activeDef = BUILTIN_AGENTS.find((a) => a.id === active) ?? BUILTIN_AGENTS[0];
  const activeState = state[active];

  const depReady = (a: AgentDef) =>
    (a.dependsOn ?? []).every((id) => !!latestByAgent[id]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>AI Agents</h1>
        <p className={styles.sub}>
          A supervised pipeline — each agent feeds the next, and the TACT Robot validates every
          output before publishing. Every run is saved to the report history.
        </p>
      </div>

      <div className={styles.subtabs}>
        <button
          className={`${styles.subtab} ${tab === 'agents' ? styles.subtabActive : ''}`}
          onClick={() => setTab('agents')}
        >
          Pipeline
        </button>
        <button
          className={`${styles.subtab} ${tab === 'reports' ? styles.subtabActive : ''}`}
          onClick={() => setTab('reports')}
        >
          Reports {reports.length ? `(${reports.length})` : ''}
        </button>
      </div>

      {tab === 'agents' ? (
        <div className={styles.body}>
          <div className={styles.sidebar}>
            {BUILTIN_AGENTS.map((a) => {
              const s = state[a.id];
              const ran = !!latestByAgent[a.id];
              const ready = depReady(a);
              return (
                <button
                  key={a.id}
                  className={`${styles.agentTab} ${active === a.id ? styles.agentTabActive : ''} ${
                    a.id === 'tact' ? styles.agentTact : ''
                  }`}
                  onClick={() => setActive(a.id)}
                >
                  <div className={styles.agentName}>{a.label}</div>
                  <div className={styles.agentStatus}>
                    {s?.busy
                      ? '⏳ running…'
                      : ran
                      ? '✓ has report'
                      : ready
                      ? '— idle'
                      : '⛓ needs upstream'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className={styles.detail}>
            <div className={styles.detailHead}>
              <div>
                <div className={styles.detailTitle}>{activeDef.label}</div>
                <div className={styles.detailMission}>{activeDef.mission}</div>
                {activeDef.dependsOn?.length ? (
                  <div className={styles.deps}>
                    Depends on:{' '}
                    {activeDef.dependsOn.map((id) => (
                      <span
                        key={id}
                        className={`${styles.depChip} ${latestByAgent[id] ? styles.depOk : ''}`}
                      >
                        {latestByAgent[id] ? '✓ ' : '— '}
                        {AGENT_LABEL.get(id) ?? id}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                className={styles.runBtn}
                onClick={() => void runAgent(activeDef)}
                disabled={activeState?.busy}
              >
                {activeState?.busy ? 'Running…' : activeDef.id === 'tact' ? '★ Run supervision' : '▶ Run agent'}
              </button>
            </div>

            {activeState?.busy ? <Loader label="Working…" /> : null}
            {activeState?.error ? <div className={styles.error}>Error: {activeState.error}</div> : null}

            {activeDef.id === 'create' ? <CreatePanel /> : null}

            {activeState?.report ? (
              <Report report={activeState.report} />
            ) : !activeState?.busy ? (
              <div className={styles.empty}>
                Click <strong>Run</strong> to send the live context to the model.
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <ReportsHistory
          reports={reports}
          agents={BUILTIN_AGENTS}
          loaded={reportsLoaded}
          onRefresh={refreshReports}
          onSetStatus={async (id, status) => {
            try {
              await setReportStatus(id, status);
              setReports((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
            } catch (err) {
              toast(corpusErrorMessage(err), 'error');
            }
          }}
          onDelete={async (id) => {
            try {
              await deleteReport(id);
              setReports((r) => r.filter((x) => x.id !== id));
              toast('Report deleted', 'info');
            } catch (err) {
              toast(corpusErrorMessage(err), 'error');
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Create agent — bulk draft generation from the syllabus ────────────────

function CreatePanel() {
  const tracks = useCorpus((s) => s.tracks);
  const domains = useCorpus((s) => s.domains);
  const lessons = useCorpus((s) => s.lessons);
  const saveLesson = useCorpus((s) => s.saveLesson);

  const [domainId_, setDomainId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const domainTracks = tracks.filter((t) => !domainId_ || t.domainId === domainId_);
  const targetLessons = useMemo(
    () => lessons.filter((l) => l.trackId === trackId && l.blocks.length === 0),
    [lessons, trackId]
  );

  const generate = async () => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return toast('Pick a module first.', 'error');
    if (targetLessons.length === 0) return toast('No empty lessons in this module.', 'info');
    setBusy(true);
    setProgress({ done: 0, total: targetLessons.length });
    let ok = 0;
    for (const [i, l] of targetLessons.entries()) {
      const res = await aiGenerateContent({
        name: l.name,
        level: l.level,
        tag: l.tag,
        track: track.nameFr,
        duration: l.duration,
      });
      if (res.ok) {
        const saved = await saveLesson({
          ...l,
          blocks: res.data.blocks ?? [],
          quizzes: res.data.quiz ? [res.data.quiz] : l.quizzes,
          status: 'draft',
        });
        if (saved) ok++;
      }
      setProgress({ done: i + 1, total: targetLessons.length });
    }
    setBusy(false);
    setProgress(null);
    toast(`Generated ${ok}/${targetLessons.length} draft lessons.`, ok ? 'success' : 'error');
  };

  return (
    <div className={styles.createBox}>
      <div className={styles.createTitle}>⚙️ Generate course content (drafts)</div>
      <p className={styles.createHint}>
        Pick a module and generate full blocks + quiz for every empty lesson. Output is saved as
        <strong> drafts</strong> for the team to review and publish.
      </p>
      <div className={styles.createRow}>
        <select
          className="app-select"
          value={domainId_}
          onChange={(e) => {
            setDomainId(e.target.value);
            setTrackId('');
          }}
        >
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.emoji} {d.name}
            </option>
          ))}
        </select>
        <select className="app-select" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          <option value="">— Module —</option>
          {domainTracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.nameFr}
            </option>
          ))}
        </select>
        <button className={styles.runBtn} disabled={busy || !trackId} onClick={() => void generate()}>
          {busy
            ? progress
              ? `Generating ${progress.done}/${progress.total}…`
              : 'Generating…'
            : `Generate ${targetLessons.length} drafts`}
        </button>
      </div>
    </div>
  );
}

// ─── Report history with filters (Agent / Date / Status) ───────────────────

function ReportsHistory({
  reports,
  agents,
  loaded,
  onRefresh,
  onSetStatus,
  onDelete,
}: {
  reports: AgentReportRecord[];
  agents: AgentDef[];
  loaded: boolean;
  onRefresh: () => void;
  onSetStatus: (id: string, status: AgentReportStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      reports.filter((r) => {
        if (agentFilter && r.agentId !== agentFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        if (dateFrom && r.createdAt.slice(0, 10) < dateFrom) return false;
        return true;
      }),
    [reports, agentFilter, statusFilter, dateFrom]
  );

  return (
    <div className={styles.reportsWrap}>
      <div className={styles.filters}>
        <label className={styles.filterLabel}>
          Agent
          <select className="app-select" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterLabel}>
          Status
          <select className="app-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {AGENT_REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterLabel}>
          From date
          <input className="app-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <button className={styles.refreshBtn} onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>

      {!loaded ? (
        <Loader label="Loading report history…" />
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          {reports.length === 0 ? 'No reports yet — run an agent.' : 'No reports match the filters.'}
        </div>
      ) : (
        <div className={styles.reportList}>
          {filtered.map((r) => (
            <div key={r.id} className={styles.reportRow}>
              <div className={styles.reportRowHead} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <div className={styles.reportMeta}>
                  <span className={styles.reportAgent}>{r.agentLabel}</span>
                  <span className={styles.reportDate}>{formatDate(r.createdAt)}</span>
                  <span className={styles.reportCount}>
                    {(r.report.findings?.length ?? 0) + (r.report.lessons?.length ?? 0)} items
                  </span>
                </div>
                <div className={styles.reportActions}>
                  <span className={`${styles.statusPill} ${styles[`st_${r.status}`] ?? ''}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  <select
                    className="app-select"
                    value={r.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onSetStatus(r.id, e.target.value as AgentReportStatus)}
                  >
                    {AGENT_REPORT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this report?')) onDelete(r.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {openId === r.id ? (
                <div className={styles.reportBody}>
                  <Report report={r.report} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<AgentReportStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
  archived: 'Archived',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Report({ report }: { report: AgentReport | AgentReportRecord['report'] }) {
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
