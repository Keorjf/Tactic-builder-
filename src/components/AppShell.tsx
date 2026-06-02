import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import styles from './AppShell.module.css';

const TABS = [
  { to: '/explore', label: 'Explore' },
  { to: '/ideas', label: 'Ideas' },
  { to: '/export', label: 'Export' },
  { to: '/stats', label: 'Stats' },
  { to: '/marketing', label: 'Marketing' },
  { to: '/agents', label: 'AI Agents' },
];

/** Topbar + tab nav + routed content. Wraps every admin route. */
export default function AppShell() {
  const profile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <div className={styles.logo}>
          TACTIC <span>CORPUS BUILDER</span>
        </div>
        <div className={styles.chips}>
          <span className={`${styles.chip} ${styles.gold}`}>
            {profile?.email ?? 'admin'}
          </span>
          <button className={styles.signOut} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.tabActive : ''}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
