/**
 * Data-access for marketing campaigns (`marketing_campaigns`) and the
 * aggregate KPI rollup (`admin_marketing_kpis`).
 *
 * Powers the Marketing Agent's KPI dashboard: ROI, CAC, conversion rate,
 * top channels, and budget allocation.
 */

import { supabase } from './supabase';
import type { CampaignStatus, MarketingCampaign, MarketingKpis } from './types';

type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  spend: number | string;
  impressions: number | string;
  clicks: number | string;
  conversions: number | string;
  revenue: number | string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
};

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function rowToCampaign(r: CampaignRow): MarketingCampaign {
  return {
    id: r.id,
    name: r.name,
    channel: r.channel,
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    conversions: num(r.conversions),
    revenue: num(r.revenue),
    startDate: r.start_date,
    endDate: r.end_date,
    status: (r.status as CampaignStatus) ?? 'active',
    createdAt: r.created_at,
  };
}

export async function fetchCampaigns(): Promise<MarketingCampaign[]> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as CampaignRow[]).map(rowToCampaign);
}

export async function upsertCampaign(
  c: Omit<MarketingCampaign, 'id' | 'createdAt'> & { id?: string }
): Promise<MarketingCampaign> {
  const row = {
    ...(c.id ? { id: c.id } : {}),
    name: c.name,
    channel: c.channel,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    conversions: c.conversions,
    revenue: c.revenue,
    start_date: c.startDate || null,
    end_date: c.endDate || null,
    status: c.status,
  };
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCampaign(data as CampaignRow);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMarketingKpis(): Promise<MarketingKpis | null> {
  const { data, error } = await supabase.rpc('admin_marketing_kpis');
  if (error) throw error;
  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    totalSpend: num(row.total_spend),
    totalRevenue: num(row.total_revenue),
    totalClicks: num(row.total_clicks),
    totalConversions: num(row.total_conversions),
    totalImpressions: num(row.total_impressions),
    roi: num(row.roi),
    cac: num(row.cac),
    conversionRate: num(row.conversion_rate),
    campaigns: num(row.campaigns),
  };
}

/** Per-channel rollup, computed client-side from the campaign list. */
export type ChannelRollup = {
  channel: string;
  spend: number;
  revenue: number;
  conversions: number;
  roi: number;
};

export function rollupByChannel(campaigns: MarketingCampaign[]): ChannelRollup[] {
  const map = new Map<string, ChannelRollup>();
  for (const c of campaigns) {
    const cur =
      map.get(c.channel) ??
      { channel: c.channel, spend: 0, revenue: 0, conversions: 0, roi: 0 };
    cur.spend += c.spend;
    cur.revenue += c.revenue;
    cur.conversions += c.conversions;
    map.set(c.channel, cur);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      roi: r.spend > 0 ? (r.revenue - r.spend) / r.spend : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}
