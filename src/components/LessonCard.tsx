import type { Lesson } from '@/lib/types';
import styles from './LessonCard.module.css';

type Props = {
  lesson: Lesson;
  onPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export default function LessonCard({
  lesson,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const hasContent = lesson.blocks.length > 0;
  return (
    <div className={styles.card}>
      <button className={styles.main} onClick={onPreview}>
        <span className={styles.emoji}>{lesson.emoji}</span>
        <span className={styles.text}>
          <span className={styles.name}>{lesson.name}</span>
          <span className={styles.meta}>
            <span className={styles.id}>{lesson.id}</span>
            <span className={styles.dot}>·</span>
            {lesson.tag}
            <span className={styles.dot}>·</span>
            {lesson.duration}
            <span className={styles.dot}>·</span>
            {lesson.coins} coins
            {!hasContent ? (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.warn}>no content</span>
              </>
            ) : null}
            {lesson.status === 'draft' ? (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.draft}>draft</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      <div className={styles.actions}>
        <button className={styles.act} onClick={onEdit} title="Edit">
          ✎
        </button>
        <button className={styles.act} onClick={onDuplicate} title="Duplicate">
          ⧉
        </button>
        <button className={`${styles.act} ${styles.danger}`} onClick={onDelete} title="Delete">
          🗑
        </button>
      </div>
    </div>
  );
}
