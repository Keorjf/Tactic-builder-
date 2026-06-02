import type { ReactNode } from 'react';

/**
 * Render lesson body text with the legacy's lightweight markup:
 *   **bold**  → <strong>
 *   <br>      → line break
 *   \n        → line break
 *
 * Returns React nodes (no dangerouslySetInnerHTML).
 */
export function richText(text: string): ReactNode {
  if (!text) return null;
  // Normalise <br> to newlines first.
  const normalised = text.replace(/<br\s*\/?>/gi, '\n');
  const lines = normalised.split('\n');

  return lines.map((line, li) => (
    <span key={li}>
      {renderBold(line)}
      {li < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

function renderBold(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}
