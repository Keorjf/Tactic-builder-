import type { Block, BlockType } from '@/lib/types';
import styles from './BlockEditor.module.css';

const TYPE_LABEL: Record<BlockType, string> = {
  hook: 'Hook',
  content: 'Content',
  tip: 'Tip',
  trap: 'Trap',
  real: 'Real example',
  info: 'Info',
};

type Props = {
  block: Block;
  index: number;
  onChange: (patch: Partial<Block>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

/** Edits one content block (type label + emoji + body text). */
export default function BlockEditor({
  block,
  onChange,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
}: Props) {
  return (
    <div className={`${styles.block} ${styles[block.type] ?? ''}`}>
      <div className={styles.head}>
        <span className={styles.badge}>{TYPE_LABEL[block.type] ?? block.type}</span>
        <input
          className={styles.emoji}
          value={block.emo ?? ''}
          maxLength={4}
          placeholder="emoji"
          onChange={(e) => onChange({ emo: e.target.value })}
        />
        <div className={styles.spacer} />
        <button
          className={styles.move}
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          title="Move up"
        >
          ↑
        </button>
        <button
          className={styles.move}
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          title="Move down"
        >
          ↓
        </button>
        <button className={styles.del} onClick={onDelete} title="Delete block">
          🗑
        </button>
      </div>
      <textarea
        className="app-textarea"
        value={block.text}
        placeholder="Block text… (use **bold** for emphasis)"
        onChange={(e) => onChange({ text: e.target.value })}
      />
    </div>
  );
}
