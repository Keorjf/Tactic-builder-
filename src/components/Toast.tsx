import { create } from 'zustand';
import { useEffect } from 'react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: number; msg: string; type: ToastType };

type ToastState = {
  items: ToastItem[];
  push: (msg: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
};

let _id = 0;

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (msg, type = 'success') => {
    const id = ++_id;
    set((s) => ({ items: [...s.items, { id, msg, type }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
    }, 3200);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/** Imperative helper so non-component code can fire a toast. */
export function toast(msg: string, type: ToastType = 'success') {
  useToast.getState().push(msg, type);
}

/** Mount once near the app root. */
export function ToastHost() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);

  // Clean up on unmount (defensive).
  useEffect(() => () => useToast.setState({ items: [] }), []);

  return (
    <div className={styles.host}>
      {items.map((t) => (
        <button
          key={t.id}
          className={`${styles.toast} ${styles[t.type]}`}
          onClick={() => dismiss(t.id)}
        >
          {t.msg}
        </button>
      ))}
    </div>
  );
}
