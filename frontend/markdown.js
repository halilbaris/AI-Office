// MyOffice · small, safe Markdown renderer for agent results (headings, lists, tables, code, quotes, links).
// Builds DOM nodes only (no innerHTML), so HTML in an agent's output can never run. Links: http(s) only.

const INLINE_SRC = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/.source;

function inline(parent, text) {
  let last = 0, m;
  const re = new RegExp(INLINE_SRC, 'g');   // one regex per call: nested inline() calls must not share lastIndex
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) { const c = document.createElement('code'); c.textContent = t.slice(1, -1); parent.append(c); }
    else if (m[2]) { const b = document.createElement('strong'); inline(b, t.slice(2, -2)); parent.append(b); }
    else if (m[3]) { const i = document.createElement('em'); inline(i, t.slice(1, -1)); parent.append(i); }
    else {
      const [, label, url] = /^\[([^\]]+)\]\((.+)\)$/.exec(t);
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; inline(a, label); parent.append(a);
    }
    last = m.index + t.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('|');
const isHr = (line) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
const listKind = (line) => /^\s*[-*+]\s+/.test(line) ? 'ul' : /^\s*\d+[.)]\s+/.test(line) ? 'ol' : null;
const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
const startsBlock = (line, next) =>
  /^```/.test(line) || /^#{1,6}\s/.test(line) || isHr(line) || /^\s*>/.test(line) || listKind(line) ||
  (line.includes('|') && next !== undefined && isSep(next));


// an ```svg block becomes a real image (an <img> with a data URI cannot run scripts); click enlarges it, the code stays one click away
function svgFigure(code) {
  const fig = document.createElement('figure'); fig.className = 'md-figure';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'md-figure-btn'; btn.title = 'Click to enlarge';
  const img = document.createElement('img');
  img.alt = (/<title[^>]*>([^<]*)</.exec(code) || [, 'SVG graphic'])[1].trim() || 'SVG graphic';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(code);
  btn.append(img);
  btn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('md-image', { detail: { src: img.src, code, alt: img.alt } })));
  const cap = document.createElement('figcaption'); cap.textContent = 'SVG preview · click to enlarge';
  const details = document.createElement('details'), sum = document.createElement('summary'), pre = document.createElement('pre'), c = document.createElement('code');
  sum.textContent = 'Show SVG code'; c.textContent = code; pre.append(c); details.append(sum, pre);
  fig.append(btn, cap, details);
  return fig;
}

export function renderMarkdown(source) {
  const root = document.createDocumentFragment();
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = /^```\s*([\w-]*)/.exec(line);
    if (fence) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      if ((fence[1].toLowerCase() === 'svg' || (!fence[1] && /^\s*<svg[\s>]/.test(code[0] || ''))) && /<\/svg>\s*$/.test(code.join('\n')) && code.join('\n').length < 300000) {
        root.append(svgFigure(code.join('\n'))); continue;
      }
      const pre = document.createElement('pre'), c = document.createElement('code');
      if (fence[1]) pre.dataset.lang = fence[1];
      c.textContent = code.join('\n'); pre.append(c); root.append(pre);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { const e = document.createElement('h' + h[1].length); inline(e, h[2]); root.append(e); i++; continue; }
    if (isHr(line)) { root.append(document.createElement('hr')); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const wrap = document.createElement('div'); wrap.className = 'md-table';
      const table = document.createElement('table'), thead = document.createElement('thead'), tr = document.createElement('tr');
      cells(line).forEach(c => { const th = document.createElement('th'); inline(th, c); tr.append(th); });
      thead.append(tr); table.append(thead);
      const tbody = document.createElement('tbody'); i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const row = document.createElement('tr');
        cells(lines[i]).forEach(c => { const td = document.createElement('td'); inline(td, c); row.append(td); });
        tbody.append(row); i++;
      }
      table.append(tbody); wrap.append(table); root.append(wrap);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = []; while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      const bq = document.createElement('blockquote'); bq.append(renderMarkdown(quote.join('\n'))); root.append(bq);
      continue;
    }
    const kind = listKind(line);
    if (kind) {
      const list = document.createElement(kind), base = indentOf(line);
      let item = null;
      while (i < lines.length && lines[i].trim() && (listKind(lines[i]) || indentOf(lines[i]) > base)) {
        const l = lines[i], ind = indentOf(l), k = listKind(l);
        if (k && ind > base && item) { // one nested level: collect and render the deeper block inside the last item
          const nested = []; while (i < lines.length && lines[i].trim() && indentOf(lines[i]) > base) nested.push(lines[i++].slice(ind));
          item.append(renderMarkdown(nested.join('\n')));
          continue;
        }
        if (k) { item = document.createElement('li'); inline(item, l.replace(/^\s*([-*+]|\d+[.)])\s+/, '')); list.append(item); }
        else if (item) { item.append(' '); inline(item, l.trim()); }   // wrapped continuation line
        i++;
      }
      root.append(list);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    const p = document.createElement('p'); inline(p, para.join(' ')); root.append(p);
  }
  return root;
}
