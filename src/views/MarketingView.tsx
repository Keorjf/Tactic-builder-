import { useEffect, useMemo, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { aiMarketing, type MarketingCopy } from '@/lib/ai';
import { computeCorpusHealth } from '@/lib/analytics';
import {
  fetchCampaigns,
  fetchMarketingKpis,
  upsertCampaign,
  deleteCampaign,
  rollupByChannel,
} from '@/lib/marketing';
import { fetchChannelAttribution, type ChannelAttribution } from '@/lib/events';
import { corpusErrorMessage } from '@/lib/corpus';
import {
  CAMPAIGN_CHANNELS,
  type CampaignStatus,
  type MarketingCampaign,
  type MarketingKpis,
} from '@/lib/types';
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

type Tab = 'dashboard' | 'copy';

const CAMPAIGN_STATUSES: CampaignStatus[] = ['planned', 'active', 'paused', 'done'];

function eur(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function MarketingView() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Marketing</h1>
        <p className={styles.sub}>
          Track campaign performance, KPIs, and budget — then draft copy from your live corpus.
        </p>
      </div>

      <div className={styles.subtabs}>
        <button
          className={`${styles.subtab} ${tab === 'dashboard' ? styles.subtabActive : ''}`}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`${styles.subtab} ${tab === 'copy' ? styles.subtabActive : ''}`}
          onClick={() => setTab('copy')}
        >
          Copy generator
        </button>
      </div>

      {tab === 'dashboard' ? <Dashboard /> : <CopyGenerator />}
    </div>
  );
}

// ─── Dashboard (KPIs + campaigns) ──────────────────────────────────────────

const blankCampaign = (): Omit<MarketingCampaign, 'id' | 'createdAt'> => ({
  name: '',
  channel: 'Meta',
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  startDate: '',
  endDate: '',
  status: 'active',
});

function Dashboard() {
  const [kpis, setKpis] = useState<MarketingKpis | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [attribution, setAttribution] = useState<ChannelAttribution[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Omit<MarketingCampaign, 'id' | 'createdAt'> | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [k, c] = await Promise.all([fetchMarketingKpis(), fetchCampaigns()]);
      setKpis(k);
      setCampaigns(c);
      fetchChannelAttribution()
        .then(setAttribution)
        .catch(() => setAttribution(null));
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const channels = useMemo(() => rollupByChannel(campaigns), [campaigns]);
  const maxSpend = Math.max(1, ...channels.map((c) => c.spend));

  const saveDraft = async () => {
    if (!draft || !draft.name.trim()) {
      toast('Campaign name is required.', 'error');
      return;
    }
    try {
      await upsertCampaign(draft);
      setDraft(null);
      toast('Campaign saved', 'success');
      void refresh();
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteCampaign(id);
      setCampaigns((list) => list.filter((c) => c.id !== id));
      void fetchMarketingKpis().then(setKpis);
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
    }
  };

  if (loading) return <Loader label="Loading marketing data…" />;

  const hasData = campaigns.length > 0;

  return (
    <div>
      {/* KPI cards */}
      <div className={styles.kpiGrid}>
        <Kpi label="ROI" value={kpis ? `${(kpis.roi * 100).toFixed(0)}%` : '—'} tone="gold" />
        <Kpi label="CAC" value={kpis ? eur(kpis.cac) : '—'} tone="blue" />
        <Kpi
          label="Conversion rate"
          value={kpis ? pct(kpis.conversionRate) : '—'}
          tone="green"
        />
        <Kpi label="Total spend" value={kpis ? eur(kpis.totalSpend) : '—'} />
        <Kpi label="Revenue" value={kpis ? eur(kpis.totalRevenue) : '—'} />
        <Kpi label="Conversions" value={kpis ? String(kpis.totalConversions) : '—'} />
      </div>

      {/* Channels + budget allocation */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Top channels &amp; budget allocation</div>
        {channels.length === 0 ? (
          <div className={styles.empty}>No campaigns yet — add one below to see channel ROI.</div>
        ) : (
          <div className={styles.channelList}>
            {channels.map((c) => (
              <div key={c.channel} className={styles.channelRow}>
                <div className={styles.channelName}>{c.channel}</div>
                <div className={styles.channelBarTrack}>
                  <div
                    className={styles.channelBar}
                    style={{ width: `${(c.spend / maxSpend) * 100}%` }}
                  />
                </div>
                <div className={styles.channelStats}>
                  <span>{eur(c.spend)}</span>
                  <span className={c.roi >= 0 ? styles.roiPos : styles.roiNeg}>
                    ROI {(c.roi * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attribution across channels */}
      {attribution && attribution.length ? (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Attribution across channels</div>
          <div className={styles.table}>
            <div className={`${styles.crow} ${styles.crowHead}`} style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr' }}>
              <div>Channel</div>
              <div>Touchpoints</div>
              <div>Conversions</div>
              <div>Conv. rate</div>
            </div>
            {attribution.map((c) => (
              <div key={c.channel} className={styles.crow} style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr' }}>
                <div className={styles.cName}>{c.channel}</div>
                <div>{c.touchpoints}</div>
                <div>{c.conversions}</div>
                <div>{pct(c.conversionRate)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Campaigns table */}
      <div className={styles.panel}>
        <div className={styles.panelHeadRow}>
          <div className={styles.panelTitle}>Campaigns</div>
          <button className={styles.primaryBtn} onClick={() => setDraft(blankCampaign())}>
            + New campaign
          </button>
        </div>

        {draft ? (
          <CampaignForm draft={draft} setDraft={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
        ) : null}

        {!hasData ? (
          <div className={styles.empty}>
            No campaign data imported yet. Add campaigns to populate the KPIs and let the Marketing
            Agent analyze performance.
          </div>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.crow} ${styles.crowHead}`}>
              <div>Campaign</div>
              <div>Channel</div>
              <div>Spend</div>
              <div>Conv.</div>
              <div>Revenue</div>
              <div>ROI</div>
              <div>Status</div>
              <div />
            </div>
            {campaigns.map((c) => {
              const roi = c.spend > 0 ? (c.revenue - c.spend) / c.spend : 0;
              return (
                <div key={c.id} className={styles.crow}>
                  <div className={styles.cName}>{c.name}</div>
                  <div>{c.channel}</div>
                  <div>{eur(c.spend)}</div>
                  <div>{c.conversions}</div>
                  <div>{eur(c.revenue)}</div>
                  <div className={roi >= 0 ? styles.roiPos : styles.roiNeg}>
                    {(roi * 100).toFixed(0)}%
                  </div>
                  <div className={styles.statusCell}>{c.status}</div>
                  <div>
                    <button className={styles.deleteBtn} onClick={() => void remove(c.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Omit<MarketingCampaign, 'id' | 'createdAt'>;
  setDraft: (d: Omit<MarketingCampaign, 'id' | 'createdAt'>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (p: Partial<MarketingCampaign>) => setDraft({ ...draft, ...p });
  const numField = (key: keyof Omit<MarketingCampaign, 'id' | 'createdAt'>, label: string) => (
    <label className={styles.field}>
      {label}
      <input
        className="app-input"
        type="number"
        value={String(draft[key] ?? 0)}
        onChange={(e) => set({ [key]: Number(e.target.value) || 0 } as Partial<MarketingCampaign>)}
      />
    </label>
  );

  return (
    <div className={styles.campaignForm}>
      <label className={styles.fieldGrow}>
        Name
        <input
          className="app-input"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        Channel
        <select
          className="app-select"
          value={draft.channel}
          onChange={(e) => set({ channel: e.target.value })}
        >
          {CAMPAIGN_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {numField('spend', 'Spend €')}
      {numField('clicks', 'Clicks')}
      {numField('conversions', 'Conversions')}
      {numField('revenue', 'Revenue €')}
      <label className={styles.field}>
        Status
        <select
          className="app-select"
          value={draft.status}
          onChange={(e) => set({ status: e.target.value as CampaignStatus })}
        >
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.formActions}>
        <button className={styles.primaryBtn} onClick={onSave}>
          Save
        </button>
        <button className={styles.ghostBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'gold' | 'blue' | 'green';
}) {
  return (
    <div className={`${styles.kpi} ${tone ? styles[`kpi_${tone}`] : ''}`}>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  );
}

// ─── Copy generator (kept from before) ─────────────────────────────────────

function CopyGenerator() {
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
    <div>
      <div className={styles.controls}>
        <label className={styles.label}>
          Audience
          <select className="app-select" value={audience} onChange={(e) => setAudience(e.target.value)}>
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
