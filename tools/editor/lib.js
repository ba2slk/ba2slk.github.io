// Pure helpers shared by the editor server and the browser app.
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.EditorLib = factory();
})(this, function () {
  const FM = /^---\n([\s\S]*?)\n---\n?/;
  const KEY = /^([A-Za-z_][\w-]*):(?:\s(.*))?$/;

  function unquote(v) {
    v = (v || '').trim();
    if (/^".*"$/.test(v)) return JSON.parse(v);
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  }

  function parseFrontMatter(text) {
    const m = text.match(FM);
    const data = {};
    if (m) for (const line of m[1].split('\n')) {
      const kv = line.match(KEY);
      if (kv) data[kv[1]] = unquote(kv[2]);
    }
    return { data, body: m ? text.slice(m[0].length) : text };
  }

  // YAML scalar: quote only when a plain value would be misread.
  function scalar(v) {
    v = String(v);
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2} [+-]\d{4})?$/.test(v)) return v; // dates stay plain
    if (v === '' || /^[\w./@()가-힣ㄱ-ㆎ -]*$/.test(v) && !/^\s|\s$|^-|: /.test(v)) return v;
    return JSON.stringify(v);
  }

  // Edit front matter line by line: changed keys are rewritten, `null` removes a key,
  // new keys are appended, everything else is kept byte for byte.
  function setFrontMatter(text, changes) {
    const m = text.match(FM);
    if (!m) {
      const keys = Object.keys(changes).filter((k) => changes[k] != null);
      if (!keys.length) return text;
      return `---\n${keys.map((k) => `${k}: ${scalar(changes[k])}`).join('\n')}\n---\n\n${text}`;
    }
    const lines = m[1].split('\n');
    const seen = new Set();
    const out = [];
    for (const line of lines) {
      const kv = line.match(KEY);
      if (!kv || !(kv[1] in changes)) { out.push(line); continue; }
      seen.add(kv[1]);
      const next = changes[kv[1]];
      if (next == null) continue;
      if (unquote(kv[2]) === String(next)) out.push(line);
      else out.push(next === '' ? `${kv[1]}:` : `${kv[1]}: ${scalar(next)}`);
    }
    for (const k of Object.keys(changes)) {
      if (!seen.has(k) && changes[k] != null && changes[k] !== '') out.push(`${k}: ${scalar(changes[k])}`);
    }
    const head = `---\n${out.join('\n')}\n---\n`;
    return head + text.slice(m[0].length);
  }

  function slugify(s) {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Resolve `rel` under `root` and refuse anything outside the allowed folders.
  function safePath(root, rel, allowed) {
    const path = require('path');
    const abs = path.resolve(root, rel);
    if (!allowed.some((dir) => abs.startsWith(path.join(root, dir) + path.sep))) throw new Error('path not allowed: ' + rel);
    return abs;
  }

  function postSlug(p) {
    return p.split('/').pop().replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
  }

  function renamePlan(p, slug) {
    const dir = p.slice(0, p.lastIndexOf('/'));
    const file = p.split('/').pop();
    const date = (file.match(/^(\d{4}-\d{2}-\d{2}-)/) || [, ''])[1];
    const old = postSlug(p);
    return { from: p, to: `${dir}/${date}${slug}.md`, imgFrom: `assets/img/posts/${old}`, imgTo: `assets/img/posts/${slug}` };
  }

  function rewriteImageLinks(text, oldSlug, newSlug) {
    return text.split(`/assets/img/posts/${oldSlug}/`).join(`/assets/img/posts/${newSlug}/`);
  }

  function seoulParts(now) {
    const s = now.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    return { date: s.slice(0, 10), time: s.slice(11, 19) };
  }

  function seoulStamp(now) {
    const { date, time } = seoulParts(now);
    return `${date} ${time} +0900`;
  }

  function publishPath(draft, now) {
    return `_posts/${seoulParts(now).date}-${postSlug(draft)}.md`;
  }

  function nextChapter(posts, book) {
    const chs = posts.filter((p) => p.book === book).map((p) => Number(p.chapter) || 0);
    return chs.length ? Math.max(...chs) + 1 : 1;
  }

  function readMinutes(html) {
    const chars = String(html).replace(/<[^>]+>/g, '').replace(/\n/g, '').length;
    return Math.max(1, Math.ceil(chars / 500));
  }

  function imageName(name, stamp) {
    const clean = String(name).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
    return `${stamp}-${clean || 'image.png'}`;
  }

  function bookFile(b) {
    const line = (k) => (b[k] ? `${k}: ${scalar(b[k])}` : `${k}:`);
    return `---\n${['title', 'author', 'publisher', 'cover', 'description', 'link'].map(line).join('\n')}\n---\n`;
  }

  // ---------- list editing (Obsidian-style) ----------
  // Lines may sit inside a quote: the `> ` prefix is kept as is and the list rules apply after it.
  const QUOTE = /^(?:> ?)*/;
  const split = (line) => { const q = QUOTE.exec(line)[0]; return [q, line.slice(q.length)]; };
  // indent, marker ("- ", "3. ", "- [ ] "), rest of the line.
  const LIST = /^( *)((?:[-*+]|\d+[.)]) (?:\[[ xX]\] )?)(.*)$/;
  const listLine = (body) => { const m = LIST.exec(body); return m && { indent: m[1].length, marker: m[2], rest: m[3] }; };
  const lead = (body) => body.match(/^ */)[0].length;

  // Indent a list line under the item above it: the child starts where the parent's text starts,
  // so `3. Foo` gets 3 spaces (2 would not nest in Markdown). Outdent goes back to the parent's level.
  function listIndentFor(lines, i, dir) {
    const [q, body] = split(lines[i]);
    const cur = lead(body);
    for (let j = i - 1; j >= 0; j--) {
      const [pq, pb] = split(lines[j]);
      if (pq.trim() !== q.trim()) break; // left this quote (or entered one)
      const p = listLine(pb);
      if (!p) { if (pb.trim() && !/^ /.test(pb)) break; continue; }
      if (dir > 0 && p.indent <= cur) { const t = p.indent + p.marker.length; return t > cur ? t : cur + 2; }
      if (dir < 0 && p.indent < cur) return p.indent;
    }
    return dir > 0 ? cur + 2 : 0;
  }

  // Tab / Shift+Tab over the lines touched by the selection. Returns the replacement for [from, to).
  function indentLines(text, s, e, dir) {
    const from = text.lastIndexOf('\n', s - 1) + 1;
    let to = text.indexOf('\n', e > s && text[e - 1] === '\n' ? e - 1 : e);
    if (to < 0) to = text.length;
    const before = text.slice(0, from).split('\n').slice(0, -1);
    const lines = text.slice(from, to).split('\n');
    // Every line moves by the same amount as the first, so nested children keep their shape.
    const first = lead(split(lines[0])[1]);
    const delta = listIndentFor(before.concat(lines), before.length, dir) - first;
    const out = lines.map((l) => {
      const [q, body] = split(l);
      if (!body.trim()) return l;
      const n = lead(body);
      return q + ' '.repeat(Math.max(0, n + delta)) + body.slice(n);
    }).join('\n');
    const shift = Math.max(-first, delta);
    return { from, to, text: out, s: Math.max(from, s + shift), e: e + out.length - (to - from) };
  }

  // Enter in a list item or quote. Returns { insert } to add at the caret, { line, nested } to
  // replace an empty item/quote line with (ending it), or null to leave Enter alone.
  // `soft` (Shift+Enter) is a plain line break that stays inside the quote, so a quote can hold
  // an empty line.
  function continueList(line, soft) {
    const [q, body] = split(line);
    const qq = q && (q.endsWith(' ') ? q : q + ' ');
    if (soft) return q ? { insert: '\n' + qq } : null;
    const m = listLine(body);
    if (!m) {
      if (!q) return null;
      return body.trim() ? { insert: '\n' + qq } : { line: '' };
    }
    if (!m.rest.trim()) return { line: q.trimEnd() ? qq : '', nested: m.indent > 0 };
    const n = /^(\d+)([.)])/.exec(m.marker);
    const marker = n ? `${Number(n[1]) + 1}${n[2]} ` : m.marker.replace(/\[[xX]\]/, '[ ]');
    return { insert: '\n' + qq + ' '.repeat(m.indent) + marker };
  }

  // Same as _plugins/arrows.rb: `->` / `<-` outside code become → / ←.
  function arrows(html) {
    return String(html).split(/(<pre[\s>][\s\S]*?<\/pre>|<code[\s>][\s\S]*?<\/code>)/).map((part, i) =>
      (i % 2 ? part : part.split('-&gt;').join('→').split('&lt;-').join('←'))).join('');
  }

  // Same rule as _includes/books-by-recent.html: newest published note first, books without notes last.
  // Unlike the site, archived books stay in the list so they can still be picked and restored.
  function booksByRecent(books, posts) {
    const latest = {};
    for (const p of posts) {
      if (!p.book || p.draft) continue;
      const d = p.path.split('/').pop().slice(0, 10);
      if (!latest[p.book] || d > latest[p.book]) latest[p.book] = d;
    }
    return books.map((b, i) => ({ b, i })).sort((x, y) => {
      const a = latest[x.b.slug] || '', c = latest[y.b.slug] || '';
      return a === c ? x.i - y.i : a < c ? 1 : -1;
    }).map((x) => x.b);
  }

  // Markdown formatter, like `ruff format` for posts: fixes syntax slips in place, never touches code.
  // Space after `#` and `>`, `-` bullets, blank lines around headings and fences, one blank line max,
  // trailing spaces off (a two-space hard break stays), an unclosed fence gets closed, one final newline.
  function formatMarkdown(text) {
    const out = [];
    let fence = null; // the opening fence while inside a code block
    let gap = false; // the previous block (heading, code) wants a blank line after it
    const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
    for (const raw of text.split('\n')) {
      if (fence) {
        out.push(raw);
        const m = raw.match(/^\s*(`{3,}|~{3,})\s*$/);
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) { fence = null; gap = true; }
        continue;
      }
      let l = raw.replace(/\s+$/, (ws) => (/^ {2,}$/.test(ws) && raw.trim() ? '  ' : ''));
      if (gap) { gap = false; if (l !== '') out.push(''); }
      const f = l.match(/^(\s*)(`{3,}|~{3,})/);
      if (f) {
        if (!f[1]) blank();
        fence = f[2];
        out.push(l);
        continue;
      }
      l = l.replace(/^(#{1,6})(?=[^#\s])/, '$1 ')
        .replace(/^(\s*(?:> ?)*>)(?=[^\s>])/, '$1 ')
        .replace(/^(\s*)[*+](?= )/, '$1-');
      if (l === '') { blank(); continue; }
      if (/^#{1,6} /.test(l)) { blank(); out.push(l); gap = true; continue; }
      out.push(l);
    }
    if (fence) { while (out[out.length - 1] === '') out.pop(); out.push(fence); }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  }

  return { formatMarkdown, indentLines, continueList, booksByRecent, arrows, parseFrontMatter, setFrontMatter, slugify, safePath, postSlug, renamePlan, rewriteImageLinks, seoulStamp, publishPath, nextChapter, readMinutes, imageName, bookFile };
});
