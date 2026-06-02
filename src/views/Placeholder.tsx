import styles from './Placeholder.module.css';

/** Temporary stand-in for views built in later phases. */
export default function Placeholder({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <div className={styles.title}>{title}</div>
        <div className={styles.sub}>Coming in {phase}.</div>
      </div>
    </div>
  );
}
