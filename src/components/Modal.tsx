import type { ReactNode } from 'react';
import { useEffect } from 'react';
import styles from './Modal.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
};

/** Centered modal dialog. */
export default function Modal({ open, onClose, title, children, maxWidth = 460 }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.card}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {title ? (
          <div className={styles.head}>
            <div className={styles.title}>{title}</div>
            <button className={styles.close} onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
