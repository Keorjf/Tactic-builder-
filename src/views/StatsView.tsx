import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { useAnalytics } from '@/store/analytics';
import {
  computeCorpusHealth,
  computeCoverage,
  computeQualityRows,
  qualityRowsToCsv,
  type LessonQuality,
} from '@/lib/analytics';
import { fleschBand, formatInt, pct } from '@/lib/format';
import {
  fetchLessonTime,
  fetchLessonFunnel,
  fetchRetention,
  fetchQuizTradingCorr,
  type LessonTime,
  type FunnelStep,
  type Retention,
  type CorrPoint,
} from '@/lib/events';
import BarRow from '@/components/BarRow';
import Loader from '@/components/Loader';
import styles from './StatsView.module.css';

type AnalyticsState = ReturnType<typeof useAnalytics.getState>;

type SortKey = 'name' | 'words' | 'flesch' | 'quizzes' | 'blocks';

export default function StatsView() {
  const corpusLoaded = useCorpus((s) => s.loaded);
  const corpusLoading = useCorpus((s) => s.loading);
  const loadCorpus = useCorpus((s) => s.load);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);
  const domains = useCorpus((s) => s.domains);

  const a = useAnalytics();

  // Filters for the quality table
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!corpusLoaded && !corpusLoading) void loadCorpus();
  }, [corpusLoaded, corpusLoading, loadCorpus]);

  useEffect(() => {
    if (!a.loaded && !a.loading) void a.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const health = useMemo(() => computeCorpusHealth(lessons, tracks), [lessons, tracks]);
  const coverage = useMemo(() => computeCoverage(health), [health]);
  const allQuality = useMemo(() => computeQualityRows(lessons, tracks), [lessons, tracks]);

  // Domain helpers (Domain → Module → Lesson).
  const trackDomain = useMemo(() => new Map(tracks.map((t) => [t.id, t.domainId ?? null])), [tracks]);
  const domainName = useMemo(() => new Map(domains.map((d) => [d.id, `${d.emoji} ${d.name}`])), [domains]);
  const lessonDomain = useMemo(() => {
    const byLesson = new Map(lessons.map((l) => [l.id, trackDomain.get(l.trackId ?? '') ?? null]));
    return byLesson;
  }, [lessons, trackDomain]);

  // Lessons-by-domain breakdown.
  const byDomain = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lessons) {
      const id = trackDomain.get(l.trackId ?? '') ?? '—';
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ label: domainName.get(id) ?? 'No domain', value: count }))
      .sort((x, y) => y.value - x.value);
  }, [lessons, trackDomain, domainName]);

  const quality = useMemo(() => {
    let rows = allQuality;
    if (domainFilter) rows = rows.filter((r) => lessonDomain.get(r.id) === domainFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(s) || r.id.toLowerCase().includes(s)
      );
    }
    return [...rows].sort((a, b) => {
      const cmp = compareBy(sortKey, a, b);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allQuality, domainFilter, lessonDomain, search, sortKey, sortDir]);

  const downloadCsv = () => {
    const csv = qualityRowsToCsv(quality);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corpus-quality-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (corpusLoading && !corpusLoaded) return <Loader full label="Loading corpus…" />;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Statistics</h1>
          <p className={styles.sub}>
            Corpus health, learner activity and content-quality breakdown.
          </p>
        </div>
        <button className={styles.btn} onClick={downloadCsv} title="Download quality table as CSV">
          Download CSV
        </button>
      </div>

      {/* ─── Corpus health ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Corpus health</h2>
        <div className={styles.kpis}>
          <Kpi label="Total lessons" value={formatInt(health.total)} tone="gold" />
          <Kpi label="Published" value={formatInt(health.published)} tone="green" />
          <Kpi label="Drafts" value={formatInt(health.drafts)} tone="orange" />
          <Kpi label="Tracks" value={formatInt(health.trackCount)} tone="blue" />
          <Kpi
            label="Empty tracks"
            value={formatInt(health.emptyTracks)}
            tone={health.emptyTracks > 0 ? 'red' : 'muted'}
            hint="tracks with zero lessons"
          />
        </div>

        <div className={styles.grid2}>
          <Card title="Lessons by domain">
            <BarRow items={byDomain} />
          </Card>
          <Card title="Lessons by tag">
            <BarRow
              items={health.byTag.slice(0, 8).map((r) => ({ label: r.label, value: r.count }))}
              color="var(--blue)"
            />
          </Card>
        </div>

        <Card title="Lessons by track">
          <BarRow
            items={health.byTrack.map((r) => ({ label: r.label, value: r.count }))}
            color="var(--purple)"
            labelWidth={28}
          />
        </Card>

        <Card title="Coverage">
          <div className={styles.coverGrid}>
            <CoverBar label="Has content" pctValue={coverage.pctContent} count={coverage.withContent} total={health.total} />
            <CoverBar label="Has quiz" pctValue={coverage.pctQuiz} count={coverage.withQuiz} total={health.total} />
            <CoverBar label="Assigned to track" pctValue={coverage.pctTrack} count={coverage.withTrack} total={health.total} />
            <CoverBar label="Translated EN" pctValue={coverage.pctEn} count={coverage.withTranslationEn} total={health.total} />
            <CoverBar label="Translated ES" pctValue={coverage.pctEs} count={coverage.withTranslationEs} total={health.total} />
          </div>
        </Card>

        {/* Gaps */}
        {(health.gaps.noContent.length > 0 ||
          health.gaps.noQuiz.length > 0 ||
          health.gaps.noTrack.length > 0) && (
          <Card title="Content gaps">
            <GapList title="No content" items={health.gaps.noContent.map((l) => l.name)} />
            <GapList title="No quiz" items={health.gaps.noQuiz.map((l) => l.name)} />
            <GapList title="No track" items={health.gaps.noTrack.map((l) => l.name)} />
          </Card>
        )}
      </section>

      {/* ─── User activity ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Learner activity</h2>

        {a.unavailable ? (
          <div className={styles.notice}>
            <strong>Activity data unavailable.</strong> Apply the{' '}
            <code>0003_admin_analytics.sql</code> migration in the Supabase SQL editor to enable
            cross-user aggregates.
          </div>
        ) : a.loading ? (
          <Loader label="Loading activity…" />
        ) : (
          <>
            <div className={styles.kpis}>
              <Kpi label="Total users" value={formatInt(a.counts?.total_users ?? 0)} tone="gold" />
              <Kpi label="Admins" value={formatInt(a.counts?.admins ?? 0)} tone="purple" />
              <Kpi
                label="Active streakers"
                value={formatInt(a.counts?.active_streakers ?? 0)}
                tone="green"
              />
              <Kpi
                label="Lessons completed"
                value={formatInt(a.counts?.total_completions ?? 0)}
                tone="blue"
              />
              <Kpi label="Total XP" value={formatInt(a.counts?.total_xp ?? 0)} tone="orange" />
              <Kpi
                label="Total Tacoins"
                value={formatInt(a.counts?.total_coins ?? 0)}
                tone="gold"
              />
            </div>

            <div className={styles.grid2}>
              <Card title="Top completed lessons">
                <BarRow
                  items={a.topCompleted.map((r) => ({
                    label: lessonLabel(r.lesson_id, allQuality),
                    value: r.completions,
                  }))}
                  color="var(--green)"
                  labelWidth={26}
                />
              </Card>
              <Card title="Hardest lessons (lowest quiz-correct rate)">
                <BarRow
                  items={a.hardest.map((r) => ({
                    label: `${lessonLabel(r.lesson_id, allQuality)} (${pct(
                      Math.round(r.correct_rate * 1000),
                      1000
                    )}%)`,
                    value: r.completions,
                  }))}
                  color="var(--red)"
                  labelWidth={26}
                />
              </Card>
            </div>

            <Card title="Mission claims">
              <BarRow
                items={a.missions.map((m) => ({ label: m.mission_id, value: m.claims }))}
                color="var(--orange)"
                labelWidth={20}
              />
            </Card>
          </>
        )}
      </section>

      {/* ─── Learning analytics ────────────────────────────────────────── */}
      {!a.unavailable && !a.loading ? (
        <LearningAnalytics analytics={a} quality={allQuality} />
      ) : null}

      {/* ─── Content quality ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Content quality</h2>

        <div className={styles.filters}>
          <input
            className={styles.search}
            placeholder="Search lessons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={styles.chipRow}>
            <button
              className={`${styles.chip} ${domainFilter === null ? styles.chipActive : ''}`}
              onClick={() => setDomainFilter(null)}
            >
              All
            </button>
            {domains.map((d) => (
              <button
                key={d.id}
                className={`${styles.chip} ${domainFilter === d.id ? styles.chipActive : ''}`}
                onClick={() => setDomainFilter(d.id)}
              >
                {d.emoji} {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <Th label="Lesson" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSortFn(setSortKey, setSortDir, sortKey, sortDir)} />
                <th>Domain</th>
                <th>Track</th>
                <Th label="Words" k="words" sortKey={sortKey} sortDir={sortDir} onSort={onSortFn(setSortKey, setSortDir, sortKey, sortDir)} align="right" />
                <Th label="Blocks" k="blocks" sortKey={sortKey} sortDir={sortDir} onSort={onSortFn(setSortKey, setSortDir, sortKey, sortDir)} align="right" />
                <Th label="Quizzes" k="quizzes" sortKey={sortKey} sortDir={sortDir} onSort={onSortFn(setSortKey, setSortDir, sortKey, sortDir)} align="right" />
                <Th label="Flesch" k="flesch" sortKey={sortKey} sortDir={sortDir} onSort={onSortFn(setSortKey, setSortDir, sortKey, sortDir)} align="right" />
                <th>Bloom</th>
                <th>EN</th>
                <th>ES</th>
              </tr>
            </thead>
            <tbody>
              {quality.map((r) => {
                const band = fleschBand(r.fleschScore);
                return (
                  <tr key={r.id}>
                    <td className={styles.cellName}>
                      <span className={styles.cellId}>{r.id}</span>
                      {r.name}
                    </td>
                    <td>{domainName.get(lessonDomain.get(r.id) ?? '') ?? '—'}</td>
                    <td className={styles.cellTrack}>{r.track}</td>
                    <td className={styles.num}>{formatInt(r.wordCount)}</td>
                    <td className={styles.num}>{r.blockCount}</td>
                    <td className={styles.num}>{r.quizCount}</td>
                    <td className={`${styles.num} ${styles[band.tone]}`}>{r.fleschScore}</td>
                    <td>{r.bloom}</td>
                    <td className={styles.center}>{r.hasTranslationEn ? '✓' : '—'}</td>
                    <td className={styles.center}>{r.hasTranslationEs ? '✓' : '—'}</td>
                  </tr>
                );
              })}
              {quality.length === 0 && (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    No lessons match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function compareBy(k: SortKey, a: LessonQuality, b: LessonQuality): number {
  switch (k) {
    case 'words':
      return a.wordCount - b.wordCount;
    case 'flesch':
      return a.fleschScore - b.fleschScore;
    case 'quizzes':
      return a.quizCount - b.quizCount;
    case 'blocks':
      return a.blockCount - b.blockCount;
    case 'name':
    default:
      return a.name.localeCompare(b.name);
  }
}

function onSortFn(
  setKey: (k: SortKey) => void,
  setDir: (d: 'asc' | 'desc') => void,
  currentKey: SortKey,
  currentDir: 'asc' | 'desc'
) {
  return (k: SortKey) => {
    if (k === currentKey) {
      setDir(currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      setKey(k);
      setDir('asc');
    }
  };
}

function lessonLabel(id: string, all: LessonQuality[]): string {
  const found = all.find((q) => q.id === id);
  return found ? found.name : id;
}

function retentionProxy(active?: number, total?: number): string {
  if (!total || total <= 0) return '—';
  return `${Math.round(((active ?? 0) / total) * 100)}%`;
}

function avgPerfect(rows: { perfect_rate: number }[]): string {
  if (rows.length === 0) return '—';
  const avg = rows.reduce((s, r) => s + r.perfect_rate, 0) / rows.length;
  return `${Math.round(avg * 100)}%`;
}

/**
 * Learning analytics — prefers real event data (0005_events.sql RPCs) and
 * falls back to honest proxies when those RPCs aren't deployed / are empty.
 */
function LearningAnalytics({
  analytics,
  quality,
}: {
  analytics: AnalyticsState;
  quality: LessonQuality[];
}) {
  const a = analytics;
  const [time, setTime] = useState<LessonTime[] | null | undefined>(undefined);
  const [retention, setRetention] = useState<Retention | null | undefined>(undefined);
  const [corr, setCorr] = useState<CorrPoint[] | null | undefined>(undefined);
  const [funnel, setFunnel] = useState<FunnelStep[] | null>(null);
  const [funnelLesson, setFunnelLesson] = useState<string>('');

  useEffect(() => {
    fetchLessonTime(15).then(setTime).catch(() => setTime(null));
    fetchRetention().then(setRetention).catch(() => setRetention(null));
    fetchQuizTradingCorr(300).then(setCorr).catch(() => setCorr(null));
  }, []);

  // Default the funnel picker to the most-trafficked lesson with events.
  useEffect(() => {
    if (time && time.length && !funnelLesson) setFunnelLesson(time[0].lessonId);
  }, [time, funnelLesson]);

  useEffect(() => {
    if (!funnelLesson) return;
    fetchLessonFunnel(funnelLesson).then(setFunnel).catch(() => setFunnel(null));
  }, [funnelLesson]);

  const realRetention = !!retention; // RPC deployed
  const realTime = !!(time && time.length);
  const realCorr = !!(corr && corr.length);
  const loading = time === undefined || retention === undefined || corr === undefined;

  const funnelOptions = time && time.length ? time : [];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Learning analytics</h2>

      {loading ? <Loader label="Loading learning analytics…" /> : null}

      {/* Retention */}
      <div className={styles.kpis}>
        <Kpi
          label="D+7 retention (R-01)"
          value={
            realRetention
              ? `${Math.round((retention!.d7 ?? 0) * 100)}%`
              : retentionProxy(a.counts?.active_streakers, a.counts?.total_users)
          }
          tone="green"
          hint={realRetention ? `${retention!.cohort} learners` : 'streak proxy'}
        />
        <Kpi
          label="D+30 retention (R-02)"
          value={realRetention ? `${Math.round((retention!.d30 ?? 0) * 100)}%` : '—'}
          tone={realRetention ? 'blue' : 'muted'}
          hint={realRetention ? `${retention!.cohort} learners` : 'needs event data'}
        />
        <Kpi
          label="Avg quiz mastery"
          value={avgPerfect(a.topCompleted)}
          tone="gold"
          hint="share of perfect quizzes"
        />
      </div>

      {/* Quiz ↔ Trading correlation */}
      <Card title="Quiz completion vs simulated-trading PnL">
        {realCorr ? (
          <>
            <p className={styles.cardNote}>
              Each point is a trading-sim session: quiz completion (x) vs PnL (y), from real event
              data ({corr!.length} sessions).
            </p>
            <CorrScatter points={corr!.map((p) => ({ x: p.quizCompletion, y: p.pnl }))} />
          </>
        ) : (
          <>
            <p className={styles.cardNote}>
              {corr === null
                ? 'Trading-sim event feed not deployed yet — showing the quiz-mastery proxy. Apply 0005_events.sql (and optionally the demo seed) to populate the real correlation.'
                : 'No trading-sim sessions recorded yet — showing the quiz-mastery proxy (quiz-perfect rate vs completions).'}
            </p>
            {a.topCompleted.length === 0 ? (
              <div className={styles.notice}>No completion data yet.</div>
            ) : (
              <QuizScatter
                points={a.topCompleted.map((r) => ({
                  x: r.perfect_rate,
                  y: r.completions,
                  label: lessonLabel(r.lesson_id, quality),
                }))}
              />
            )}
          </>
        )}
      </Card>

      {/* Time-on-lesson */}
      {realTime ? (
        <Card title="Real-time spent per lesson (avg)">
          <BarRow
            items={time!.map((t) => ({
              label: lessonLabel(t.lessonId, quality),
              value: t.avgSeconds,
            }))}
            color="var(--blue)"
            labelWidth={26}
          />
        </Card>
      ) : null}

      {/* Drop-off funnel */}
      <Card title="Drop-off funnel per lesson">
        {realTime ? (
          <>
            <div className={styles.funnelHead}>
              <select
                className="app-select"
                value={funnelLesson}
                onChange={(e) => setFunnelLesson(e.target.value)}
              >
                {funnelOptions.map((t) => (
                  <option key={t.lessonId} value={t.lessonId}>
                    {lessonLabel(t.lessonId, quality)}
                  </option>
                ))}
              </select>
            </div>
            {funnel && funnel.length ? (
              <BarRow
                items={funnel.map((s) => ({ label: `Step ${s.stepIndex}`, value: s.learners }))}
                color="var(--purple)"
                labelWidth={16}
              />
            ) : (
              <div className={styles.notice}>No funnel data for this lesson.</div>
            )}
          </>
        ) : (
          <>
            <p className={styles.cardNote}>
              Step-level event feed not deployed yet — showing a drop-off proxy (lessons with the
              lowest quiz-correct rate are where learners most likely disengage).
            </p>
            <BarRow
              items={a.hardest.slice(0, 8).map((r) => ({
                label: lessonLabel(r.lesson_id, quality),
                value: Math.round((1 - r.correct_rate) * 100),
              }))}
              color="var(--red)"
              labelWidth={26}
            />
          </>
        )}
      </Card>
    </section>
  );
}

/** Scatter that supports negative y (e.g. PnL). */
function CorrScatter({ points }: { points: { x: number; y: number }[] }) {
  const W = 520;
  const H = 240;
  const pad = 40;
  const ys = points.map((p) => p.y);
  const yMax = Math.max(1, ...ys);
  const yMin = Math.min(0, ...ys);
  const span = yMax - yMin || 1;
  const sx = (x: number) => pad + Math.max(0, Math.min(1, x)) * (W - pad * 2);
  const sy = (y: number) => H - pad - ((y - yMin) / span) * (H - pad * 2);
  const zeroY = sy(0);
  const color = (y: number) => (y >= 0 ? 'var(--green)' : 'var(--red)');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.scatter} role="img" aria-label="Quiz vs PnL scatter">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="var(--border2)" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="var(--border2)" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={sx(t)} y={H - pad + 14} fontSize="8" fill="var(--muted)" textAnchor="middle">
          {Math.round(t * 100)}%
        </text>
      ))}
      <text x={W / 2} y={H - 4} fontSize="9" fill="var(--muted)" textAnchor="middle">
        Quiz completion
      </text>
      <text x={12} y={H / 2} fontSize="9" fill="var(--muted)" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>
        PnL (€)
      </text>
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={color(p.y)} opacity={0.7}>
          <title>
            {Math.round(p.x * 100)}% quiz · {p.y.toFixed(0)}€
          </title>
        </circle>
      ))}
    </svg>
  );
}

/** Minimal dependency-free scatter plot (quiz mastery × engagement). */
function QuizScatter({ points }: { points: { x: number; y: number; label: string }[] }) {
  const W = 520;
  const H = 240;
  const pad = 34;
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const sx = (x: number) => pad + x * (W - pad * 2); // x is 0..1
  const sy = (y: number) => H - pad - (y / maxY) * (H - pad * 2);
  const color = (x: number) => (x >= 0.7 ? 'var(--green)' : x >= 0.5 ? 'var(--orange)' : 'var(--red)');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.scatter} role="img" aria-label="Quiz mastery scatter">
      {/* axes */}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--border2)" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="var(--border2)" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={sx(t)} y={H - pad + 14} fontSize="8" fill="var(--muted)" textAnchor="middle">
          {Math.round(t * 100)}%
        </text>
      ))}
      <text x={W / 2} y={H - 4} fontSize="9" fill="var(--muted)" textAnchor="middle">
        Quiz-perfect rate
      </text>
      <text x={10} y={H / 2} fontSize="9" fill="var(--muted)" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`}>
        Completions
      </text>
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={5} fill={color(p.x)} opacity={0.8}>
          <title>
            {p.label} — {Math.round(p.x * 100)}% perfect, {p.y} completions
          </title>
        </circle>
      ))}
    </svg>
  );
}

// ─── Tiny inline components ───────────────────────────────────────────────

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'orange' | 'muted';
  hint?: string;
}) {
  return (
    <div className={styles.kpi}>
      <div className={`${styles.kpiValue} ${styles[`tone_${tone}`]}`}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {hint ? <div className={styles.kpiHint}>{hint}</div> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

function CoverBar({
  label,
  pctValue,
  count,
  total,
}: {
  label: string;
  pctValue: number;
  count: number;
  total: number;
}) {
  const tone = pctValue >= 80 ? 'good' : pctValue >= 50 ? 'warn' : 'bad';
  return (
    <div className={styles.coverItem}>
      <div className={styles.coverHead}>
        <span>{label}</span>
        <span className={`${styles.coverPct} ${styles[tone]}`}>{pctValue}%</span>
      </div>
      <div className={styles.coverTrack}>
        <div className={`${styles.coverFill} ${styles[tone]}`} style={{ width: `${pctValue}%` }} />
      </div>
      <div className={styles.coverMeta}>
        {count} / {total} lessons
      </div>
    </div>
  );
}

function GapList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.gap}>
      <div className={styles.gapTitle}>
        {title} <span className={styles.gapCount}>({items.length})</span>
      </div>
      <ul className={styles.gapList}>
        {items.slice(0, 5).map((name, i) => (
          <li key={i}>{name}</li>
        ))}
        {items.length > 5 ? <li className={styles.gapMore}>+ {items.length - 5} more</li> : null}
      </ul>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'right';
}) {
  const active = sortKey === k;
  return (
    <th className={align === 'right' ? styles.thRight : undefined}>
      <button className={`${styles.thBtn} ${active ? styles.thBtnActive : ''}`} onClick={() => onSort(k)}>
        {label}
        {active ? <span className={styles.thArrow}>{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </th>
  );
}
