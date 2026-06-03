import styles from './BarRow.module.css';

type Item = { label: string; value: number };

type Props = {
  items: Item[];
  /** Optional override; defaults to max(value). */
  max?: number;
  /** Format the trailing number (default: plain integer). */
  format?: (n: number) => string;
  /** CSS color or var() for the bar fill. */
  color?: string;
  /** Truncate the label column at this many characters. */
  labelWidth?: number;
};

/**
 * Compact horizontal bar list. SVG-free, just nested divs with widths —
 * keeps the bundle lean and matches the existing dark-teal/gold theme.
 */
export default function BarRow({
  items,
  max,
  format,
  color = 'var(--gold)',
  labelWidth,
}: Props) {
  if (items.length === 0) {
    return <div className={styles.empty}>No data</div>;
  }
  const ceiling = max ?? Math.max(...items.map((i) => i.value), 1);
  const fmt = format ?? ((n: number) => String(n));

  return (
    <div className={styles.list}>
      {items.map((it, i) => {
        const pct = Math.max(2, Math.round((it.value / ceiling) * 100));
        return (
          <div key={`${it.label}-${i}`} className={styles.row}>
            <div
              className={styles.label}
              style={labelWidth ? { width: `${labelWidth}ch` } : undefined}
              title={it.label}
            >
              {it.label}
            </div>
            <div className={styles.track}>
              <div className={styles.bar} style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className={styles.value}>{fmt(it.value)}</div>
          </div>
        );
      })}
    </div>
  );
}
