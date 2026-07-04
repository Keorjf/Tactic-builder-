/**
 * Data-access for the Collaborator Administration panel.
 *
 * Member listing and role changes go through SECURITY DEFINER RPCs
 * (admin_list_members / admin_set_role) so the client never needs broad
 * access to `profiles`. Invites are handled by the admin-ai edge function
 * (it holds the service-role key). The audit log is read directly.
 */

import { supabase } from './supabase';
import { aiInvite } from './ai';
import type { AdminRole, AuditEntry, Member } from './types';

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
};

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.rpc('admin_list_members');
  if (error) throw error;
  return (data as MemberRow[]).map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: (r.role as AdminRole) ?? 'learner',
    createdAt: r.created_at ?? undefined,
  }));
}

export async function setMemberRole(id: string, role: AdminRole): Promise<void> {
  const { error } = await supabase.rpc('admin_set_role', { p_id: id, p_role: role });
  if (error) throw error;
}

type AuditRow = {
  id: string;
  actor_email: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export async function fetchAuditLog(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as AuditRow[]).map((r) => ({
    id: r.id,
    actorEmail: r.actor_email,
    action: r.action,
    target: r.target,
    detail: r.detail ?? {},
    createdAt: r.created_at,
  }));
}

/** Invite a collaborator by email (delegates to the edge function). */
export async function inviteMember(
  email: string,
  role: AdminRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await aiInvite({ email, role });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
