import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/store/auth';
import Loader from './Loader';
import styles from './RequireAdmin.module.css';

/**
 * Route guard. While the session resolves → spinner. No session →
 * redirect to /auth. Authenticated but not an admin → a forbidden notice
 * with a sign-out escape hatch.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const loading = useAuth((s) => s.loading);
  const session = useAuth((s) => s.session);
  const isAdmin = useAuth((s) => s.isAdmin);
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);

  if (loading) return <Loader full label="Loading session…" />;
  if (!session) return <Navigate to="/auth" replace />;

  if (!isAdmin) {
    return (
      <div className={styles.forbidden}>
        <div className={styles.card}>
          <div className={styles.icon}>🔒</div>
          <h1 className={styles.title}>Admin access required</h1>
          <p className={styles.body}>
            You're signed in as{' '}
            <strong>{profile?.email ?? 'this account'}</strong> (role:{' '}
            <code>{profile?.role ?? 'learner'}</code>), but the Corpus Builder
            is restricted to administrators.
          </p>
          <p className={styles.hint}>
            Ask an existing admin to promote your account, then sign back in.
          </p>
          <button className={styles.btn} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
