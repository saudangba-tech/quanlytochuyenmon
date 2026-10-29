import { memo, useMemo } from 'react';
import katex from 'katex';
import { splitMath } from './mathSplit.js';

function renderTex(tex, displayMode) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', trust: false });
  } catch {
    return `<code>${tex.replace(/</g, '&lt;')}</code>`;
  }
}

// Hiển thị văn bản có công thức LaTeX ($...$, $$...$$) bằng KaTeX
export const MathText = memo(function MathText({ text, className = '', as: Tag = 'div' }) {
  const parts = useMemo(() => splitMath(text || ''), [text]);
  return (
    <Tag className={`math-content whitespace-pre-wrap ${className}`}>
      {parts.map((p, i) =>
        p.type === 'text' ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span
            key={i}
            className={p.type === 'display' ? 'block' : ''}
            dangerouslySetInnerHTML={{ __html: renderTex(p.value, p.type === 'display') }}
          />
        )
      )}
    </Tag>
  );
});
