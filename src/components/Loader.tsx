import styles from './Loader.module.css';

type Props = {
  label?: string;
  full?: boolean;
};

/** Centered spinner. `full` fills the viewport (used by route guards). */
export default function Loader({ label, full }: Props) {
  return (
    <div className={full ? styles.full : styles.inline}>
      <div className={styles.spinner} />
      {label ? <div className={styles.label}>{label}</div> : null}
    </div>
  );
}
