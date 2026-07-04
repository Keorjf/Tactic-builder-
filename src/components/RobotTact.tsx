import { useEffect, useRef, useState } from 'react';
import { useCorpus } from '@/store/corpus';
import { computeCorpusHealth } from '@/lib/analytics';
import { aiAssistant, type ChatTurn } from '@/lib/ai';
import styles from './RobotTact.module.css';

/**
 * Robot Tact — a floating AI assistant pinned to the bottom of every page.
 * Chats about the corpus using a trimmed stats context.
 */
export default function RobotTact() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const lessons = useCorpus((s) => s.lessons);
  const tracks = useCorpus((s) => s.tracks);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy, open]);

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    const history = turns;
    setTurns((t) => [...t, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);

    const h = computeCorpusHealth(lessons, tracks);
    const context = {
      lessons: h.total,
      published: h.published,
      drafts: h.drafts,
      tracks: h.trackCount,
      byLevel: h.byLevel,
      topTracks: h.byTrack.slice(0, 6),
      domains: h.byTag.slice(0, 10),
    };

    const res = await aiAssistant({ message, history, context });
    setBusy(false);
    setTurns((t) => [
      ...t,
      { role: 'assistant', content: res.ok ? res.data.reply : `⚠️ ${res.error}` },
    ]);
  };

  return (
    <>
      <button
        className={styles.fab}
        onClick={() => setOpen((o) => !o)}
        aria-label="Robot Tact assistant"
        title="Robot Tact"
      >
        {open ? '✕' : '🤖'}
      </button>

      {open ? (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.botName}>🤖 Robot Tact</span>
            <span className={styles.botSub}>Corpus assistant</span>
          </div>

          <div className={styles.body} ref={bodyRef}>
            {turns.length === 0 ? (
              <div className={styles.welcome}>
                Hi! I'm <strong>Robot Tact</strong>. Ask me about your corpus — coverage gaps,
                what to build next, how a tab works, or marketing/analytics.
                <div className={styles.suggestions}>
                  {[
                    'What should I work on next?',
                    'Which tracks are thin on lessons?',
                    'How do I add a domain?',
                  ].map((s) => (
                    <button key={s} className={styles.suggestion} onClick={() => setInput(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <div
                  key={i}
                  className={`${styles.msg} ${t.role === 'user' ? styles.msgUser : styles.msgBot}`}
                >
                  {t.content}
                </div>
              ))
            )}
            {busy ? <div className={`${styles.msg} ${styles.msgBot}`}>…</div> : null}
          </div>

          <div className={styles.inputBar}>
            <input
              className={styles.input}
              value={input}
              placeholder="Ask Robot Tact…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
            />
            <button className={styles.sendBtn} onClick={() => void send()} disabled={busy || !input.trim()}>
              ➤
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
