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
import { LEVELS, type Level } from '@/lib/types';
import BarRow from '@/components/BarRow';
import Loader from '@/components/Loader';
import styles from './StatsView.module.css';

type SortKey = 'name' | 'words' | 'flesch' | 'quizzes' | 'blocks';

export default function StatsView() {
  const corpusLoaded = useCorpus((s) => s.loaded);
  const corpusLoading = useCorpus((s) => s.loading);
  const loadCorpus = useCorpus((s) => s.load);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);

  const a = useAnalytics();

  // Filters for the quality table
  const [levelFilter, setLevelFilter] = useState<Level | null>(null);
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

  const quality = useMemo(() => {
    let rows = allQuality;
    if (levelFilter) rows = rows.filter((r) => r.level === levelFilter);
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
  }, [allQuality, levelFilter, search, sortKey, sortDir]);

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
          <Card title="Lessons by level">
            <BarRow items={health.byLevel.map((r) => ({ label: r.label, value: r.count }))} />
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
              className={`${styles.chip} ${levelFilter === null ? styles.chipActive : ''}`}
              onClick={() => setLevelFilter(null)}
            >
              All
            </button>
            {LEVELS.map((lv) => (
              <button
                key={lv}
                className={`${styles.chip} ${levelFilter === lv ? styles.chipActive : ''}`}
                onClick={() => setLevelFilter(lv)}
              >
                {lv}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <Th label="Lesson" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSortFn(setSortKey, setSortDir, sortKey, sortDir)} />
                <th>Level</th>
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
                    <td>{r.level}</td>
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
