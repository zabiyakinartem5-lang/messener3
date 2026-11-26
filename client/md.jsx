import React, { useState } from 'react';

// Small, safe Markdown renderer for assistant replies (no HTML injection: only React elements).
function inline(text, key) {
  const out = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(<code key={key + i++}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<b key={key + i++}>{t.slice(2, -2)}</b>);
    else if (m[3]) out.push(<i key={key + i++}>{t.slice(1, -1)}</i>);
    else { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t); out.push(<a key={key + i++} href={mm[2]} target="_blank" rel="noreferrer noopener">{mm[1]}</a>); }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Code({ lang, code }) {
  const [done, setDone] = useState(false);
  return (
    <div className="code-block">
      <div className="code-head"><span>{lang || 'code'}</span>
        <button onClick={() => { navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => {}); }}>{done ? 'Copied' : 'Copy'}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export function Markdown({ text }) {
  const parts = text.split(/```/);
  const nodes = [];
  parts.forEach((p, idx) => {
    if (idx % 2 === 1) {
      const nl = p.indexOf('\n');
      const lang = nl >= 0 ? p.slice(0, nl).trim() : '';
      nodes.push(<Code key={'c' + idx} lang={lang} code={(nl >= 0 ? p.slice(nl + 1) : p).replace(/\n$/, '')} />);
      return;
    }
    const lines = p.split('\n');
    let list = null;
    const flush = () => { if (list) { nodes.push(list.ordered ? <ol key={'l' + idx + nodes.length}>{list.items}</ol> : <ul key={'l' + idx + nodes.length}>{list.items}</ul>); list = null; } };
    lines.forEach((ln, j) => {
      const k = idx + '-' + j;
      const li = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(ln);
      if (li) {
        const ordered = !!li[2];
        if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
        list.items.push(<li key={k}>{inline(li[3], k)}</li>);
        return;
      }
      flush();
      const h = /^(#{1,4})\s+(.*)$/.exec(ln);
      if (h) nodes.push(<div className="md-h" key={k}>{inline(h[2], k)}</div>);
      else if (ln.trim()) nodes.push(<p key={k}>{inline(ln, k)}</p>);
    });
    flush();
  });
  return <div className="md">{nodes}</div>;
}
