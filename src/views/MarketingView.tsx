import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { aiMarketing, type MarketingCopy } from '@/lib/ai';
import { computeCorpusHealth } from '@/lib/analytics';
import { toast } from '@/components/Toast';
import Loader from '@/components/Loader';
import styles from './MarketingView.module.css';

const AUDIENCES = [
  'Young adult investors (18–35) in France',
  'Students who want to learn personal finance',
  'Adults rebuilding their financial literacy',
];
const GOALS = [
  'Drive new signups',
  'Re-engage lapsed users',
  'Promote a new module',
  'Launch the iOS/Android app',
];

export default function MarketingView() {
  const loaded = useCorpus((s) => s.loaded);
  const loading = useCorpus((s) => s.loading);
  const load = useCorpus((s) => s.load);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);

  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [goal, setGoal] = useState(GOALS[0]);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<MarketingCopy | null>(null);

  useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);

  const stats = useMemo(() => {
    const h = computeCorpusHealth(lessons, tracks);
    return {
      lessonCount: h.total,
      published: h.published,
      trackCount: h.trackCount,
      levels: h.byLevel.map((l) => ({ level: l.label, count: l.count })),
      topTracks: h.byTrack.slice(0, 5).map((t) => ({ track: t.label, count: t.count })),
    };
  }, [lessons, tracks]);

  const run = async () => {
    setBusy(true);
    const res = await aiMarketing({ corpusStats: stats, audience, goal });
    setBusy(false);
    if (!res.ok) {
      toast(`Failed: ${res.error}`, 'error');
      return;
    }
    setCopy(res.data);
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast('Copied to clipboard', 'success'),
      () => toast('Copy failed', 'error')
    );
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Marketing</h1>
        <p className={styles.sub}>
          Generate headlines, social posts, value props and a CTA from your live corpus stats.
        </p>
      </div>

      <div className={styles.controls}>
        <label className={styles.label}>
          Audience
          <select
            className="app-select"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            {AUDIENCES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Goal
          <select className="app-select" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOALS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <button className={styles.runBtn} onClick={() => void run()} disabled={busy}>
          {busy ? 'Drafting…' : '✨ Generate copy'}
        </button>
      </div>

      {busy && !copy ? <Loader label="Drafting marketing copy…" /> : null}

      {copy ? (
        <div className={styles.results}>
          <Section title="Headlines" items={copy.headlines} onCopy={copyToClipboard} />
          <Section title="Social posts" items={copy.social_posts} multiline onCopy={copyToClipboard} />
          <Section title="Value propositions" items={copy.value_props} onCopy={copyToClipboard} />
          <div className={styles.cta}>
            <div className={styles.ctaLabel}>Call to action</div>
            <div className={styles.ctaValue}>{copy.cta}</div>
            <button className={styles.copyBtn} onClick={() => copyToClipboard(copy.cta)}>
              Copy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  items,
  multiline,
  onCopy,
}: {
  title: string;
  items: string[];
  multiline?: boolean;
  onCopy: (s: string) => void;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <ul className={styles.list}>
        {items.map((s, i) => (
          <li key={i} className={multiline ? styles.itemMulti : styles.item}>
            <span className={styles.itemText}>{s}</span>
            <button className={styles.copyBtn} onClick={() => onCopy(s)}>
              Copy
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
