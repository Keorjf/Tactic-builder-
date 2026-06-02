import type { ReactNode } from 'react';
import { useEffect } from 'react';
import styles from './Drawer.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  width?: number | string;
  children: ReactNode;
};

/** Right-side slide-over drawer. Mirrors the legacy `.create-drawer`. */
export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  width = 'min(720px, 100vw)',
  children,
}: Props) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
      />
      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        style={{ width }}
        role="dialog"
        aria-hidden={!open}
      >
        <header className={styles.header}>
          <div className={styles.headText}>
            {title ? <div className={styles.title}>{title}</div> : null}
            {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
          </div>
          <div className={styles.headActions}>
            {actions}
            <button className={styles.close} onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </>
  );
}
