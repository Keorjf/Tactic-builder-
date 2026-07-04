import { useEffect, useState } from 'react';
import {
  fetchMembers,
  setMemberRole,
  fetchAuditLog,
  inviteMember,
} from '@/lib/admin';
import { corpusErrorMessage } from '@/lib/corpus';
import {
  ADMIN_ROLES,
  ROLE_LABELS,
  type AdminRole,
  type AuditEntry,
  type Member,
} from '@/lib/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/components/Toast';
import Loader from '@/components/Loader';
import styles from './MembersView.module.css';

export default function MembersView() {
  const me = useAuth((s) => s.profile);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('ped');
  const [inviting, setInviting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([fetchMembers(), fetchAuditLog(50)]);
      setMembers(m);
      setAudit(a);
    } catch (e) {
      toast(corpusErrorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRole = async (m: Member, role: AdminRole) => {
    const prev = m.role;
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x)));
    try {
      await setMemberRole(m.id, role);
      toast(`${m.email ?? 'Member'} → ${ROLE_LABELS[role]}`, 'success');
      void fetchAuditLog(50).then(setAudit);
    } catch (e) {
      setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, role: prev } : x)));
      toast(corpusErrorMessage(e), 'error');
    }
  };

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      toast('Enter an email to invite.', 'error');
      return;
    }
    setInviting(true);
    const res = await inviteMember(email, inviteRole);
    setInviting(false);
    if (!res.ok) {
      toast(`Invite failed: ${res.error}`, 'error');
      return;
    }
    toast(`Invited ${email} as ${ROLE_LABELS[inviteRole]}`, 'success');
    setInviteEmail('');
    void refresh();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Collaborators</h1>
        <p className={styles.sub}>
          Invite collaborators, assign roles &amp; permissions, and audit activity.
        </p>
      </div>

      {/* Invite */}
      <div className={styles.inviteBar}>
        <input
          className="app-input"
          placeholder="collaborator@email.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void invite();
          }}
        />
        <select
          className="app-select"
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as AdminRole)}
        >
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button className={styles.primaryBtn} disabled={inviting} onClick={() => void invite()}>
          {inviting ? 'Inviting…' : '✉ Invite'}
        </button>
      </div>

      {loading ? (
        <Loader label="Loading members…" />
      ) : (
        <>
          {/* Members */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Members ({members.length})</div>
            <div className={styles.table}>
              <div className={`${styles.row} ${styles.rowHead}`}>
                <div>Email</div>
                <div>Name</div>
                <div>Joined</div>
                <div>Role</div>
              </div>
              {members.map((m) => (
                <div key={m.id} className={styles.row}>
                  <div className={styles.cellEmail}>
                    {m.email ?? '—'}
                    {m.id === me?.id ? <span className={styles.youTag}>you</span> : null}
                  </div>
                  <div>{m.fullName ?? '—'}</div>
                  <div className={styles.cellMuted}>
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}
                  </div>
                  <div>
                    <select
                      className="app-select"
                      value={m.role}
                      onChange={(e) => void changeRole(m, e.target.value as AdminRole)}
                    >
                      {ADMIN_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit log */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Activity log</div>
            {audit.length === 0 ? (
              <div className={styles.empty}>No activity recorded yet.</div>
            ) : (
              <div className={styles.auditList}>
                {audit.map((a) => (
                  <div key={a.id} className={styles.auditRow}>
                    <span className={styles.auditAction}>{a.action}</span>
                    <span className={styles.auditText}>
                      {a.actorEmail ?? 'someone'} → {a.target ?? '—'}
                      {a.detail?.role ? ` (${String(a.detail.role)})` : ''}
                    </span>
                    <span className={styles.auditDate}>
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
