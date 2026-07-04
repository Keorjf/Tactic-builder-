import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import LessonEditorDrawer from '@/views/LessonEditorDrawer';
import PreviewDrawer from '@/views/PreviewDrawer';
import RobotTact from '@/components/RobotTact';
import styles from './AppShell.module.css';

const TABS = [
  { to: '/explore', label: 'Explore' },
  { to: '/ideas', label: 'Ideas' },
  { to: '/content', label: 'Content' },
  { to: '/export', label: 'Export' },
  { to: '/stats', label: 'Stats' },
  { to: '/marketing', label: 'Marketing' },
  { to: '/agents', label: 'AI Agents' },
  { to: '/members', label: 'Collaborators' },
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

      {/* Mounted globally so the editor/preview work from any tab. */}
      <LessonEditorDrawer />
      <PreviewDrawer />
      <RobotTact />
    </div>
  );
}
