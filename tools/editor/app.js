/* global EditorLib, marked, hljs */
(function () {
  const L = EditorLib;
  const $ = (id) => document.getElementById(id);
  const app = $('app');

  const api = async (url, body) => {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error), { status: r.status });
    return j;
  };

  let posts = [];
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const closedBooks = new Set((() => { try { return JSON.parse(localStorage.getItem('closed-books')) || []; } catch (e) { return []; } })());
  let books = [];
  // cur: { path|null, raw (text last read/saved), mtime, draft, kind: 'article'|'note' }
  let cur = null;
  let conflict = false;

  // ---------- status ----------
  function status(text, error) {
    $('status').textContent = text;
    $('status').classList.toggle('error', !!error);
  }

  // ---------- sidebar ----------
  async function loadLists() {
    [posts, books] = await Promise.all([api('/api/posts'), api('/api/books')]);
    renderList();
    renderBookOptions();
  }

  function renderList() {
    const q = $('filter').value.trim().toLowerCase();
    const row = (p, meta) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = cur && cur.path === p.path ? 'on' : '';
      b.innerHTML = '<span class="t"></span><span class="m"></span>';
      b.querySelector('.t').textContent = p.title;
      b.querySelector('.m').textContent = meta;
      b.onclick = () => { closeDrawer(); open(p.path); };
      li.appendChild(b);
      return li;
    };
    const none = (text) => Object.assign(document.createElement('li'), { className: 'none', textContent: text });
    const date = (p) => p.path.slice(7, 17);
    const bookTitle = (p) => (books.find((b) => b.slug === p.book) || {}).title || p.book;
    const match = (p) => !q || p.title.toLowerCase().includes(q) || p.slug.includes(q) || (p.book && bookTitle(p).toLowerCase().includes(q));
    const live = posts.filter(match);

    const drafts = live.filter((p) => p.draft).map((p) => row(p, p.book ? `${bookTitle(p)}` : p.slug));
    $('drafts').replaceChildren(...(drafts.length ? drafts : [none('No drafts')]));

    const articles = live.filter((p) => !p.draft && !p.archived && !p.book).map((p) => row(p, date(p)));
    $('articles').replaceChildren(...(articles.length ? articles : [none('No articles')]));

    // Book notes grouped under their book, in chapter order.
    const notes = live.filter((p) => !p.draft && !p.archived && p.book);
    const order = [...L.booksByRecent(books, posts).map((b) => b.slug), ...notes.map((p) => p.book)].filter((v, i, a) => a.indexOf(v) === i);
    const groups = order.map((slug) => {
      const items = notes.filter((p) => p.book === slug).sort((a, b) => (Number(a.chapter) || 0) - (Number(b.chapter) || 0));
      if (!items.length) return null;
      const d = document.createElement('details');
      d.className = 'book-group';
      d.dataset.slug = slug;
      d.open = !closedBooks.has(slug) || items.some((p) => cur && cur.path === p.path) || !!q;
      d.addEventListener('toggle', () => { d.open ? closedBooks.delete(slug) : closedBooks.add(slug); remember('closed-books', JSON.stringify([...closedBooks])); });
      const sum = document.createElement('summary');
      sum.append(bookTitle(items[0]));
      sum.appendChild(Object.assign(document.createElement('small'), { textContent: items.length }));
      const ul = Object.assign(document.createElement('ul'), { className: 'list' });
      ul.append(...items.map((p) => row(p, date(p))));
      d.append(sum, ul);
      return d;
    }).filter(Boolean);
    $('books').replaceChildren(...(groups.length ? groups : [Object.assign(document.createElement('ul'), { className: 'list' })]));
    if (!groups.length) $('books').firstChild.appendChild(none('No book notes'));

    updateBooksToggle();

    const archived = live.filter((p) => p.archived).map((p) => row(p, p.book ? bookTitle(p) : date(p)));
    $('archived').replaceChildren(...(archived.length ? archived : [none('Nothing archived')]));
  }

  const bookGroups = () => [...$('books').querySelectorAll('.book-group')];
  function updateBooksToggle() {
    const groups = bookGroups();
    $('toggle-books').hidden = groups.length < 2;
    $('toggle-books').textContent = groups.some((d) => !d.open) ? 'Expand all' : 'Collapse all';
  }
  $('toggle-books').onclick = () => {
    const open = bookGroups().some((d) => !d.open);
    bookGroups().forEach((d) => { d.open = open; });
    // `toggle` events fire async; persist and relabel right away.
    bookGroups().forEach((d) => { const slug = d.dataset.slug; open ? closedBooks.delete(slug) : closedBooks.add(slug); });
    remember('closed-books', JSON.stringify([...closedBooks]));
    updateBooksToggle();
  };
  $('books').addEventListener('toggle', updateBooksToggle, true);

  function renderBookOptions() {
    const sel = $('f-book');
    const value = sel.value;
    sel.replaceChildren(...L.booksByRecent(books, posts).map((b) => new Option(b.title + (b.archived === 'true' ? ' (archived)' : ''), b.slug)), new Option('+ New book…', '__new'));
    if (value && value !== '__new') sel.value = value;
  }

  // ---------- open / new ----------
  async function open(path) {
    if (!(await flush())) return;
    const r = await api('/api/post?path=' + encodeURIComponent(path));
    load({ path, raw: r.text, mtime: r.mtime, draft: path.startsWith('_drafts/') });
  }

  async function newPost(kind) {
    if (!(await flush())) return;
    closeDrawer();
    let raw = '---\ntitle:\n---\n\n';
    if (kind === 'note') {
      const first = L.booksByRecent(books, posts)[0];
      const book = first ? first.slug : '';
      raw = L.setFrontMatter(raw, { book, chapter: book ? String(L.nextChapter(posts, book)) : '' });
    }
    load({ path: null, raw, mtime: null, draft: true, kind });
    $('f-title').focus();
  }

  function load(next) {
    const { data, body } = L.parseFrontMatter(next.raw);
    cur = { ...next, kind: next.kind || (data.book ? 'note' : 'article'), archived: data.published === 'false' };
    conflict = false;
    $('conflict').hidden = true;
    $('empty').hidden = true;
    $('doc').hidden = false;
    app.dataset.kind = cur.kind;
    $('f-title').value = data.title || '';
    $('f-slug').value = cur.path ? L.postSlug(cur.path) : '';
    fitSlug();
    $('f-book').value = data.book || (books[0] ? books[0].slug : '');
    $('f-chapter').value = data.chapter || '';
    $('src').value = body.replace(/^\n/, '');
    refreshImageOptions(data.image || '');
    showActions();
    status(cur.path ? (cur.draft ? 'Draft' : cur.archived ? 'Archived · not on the site' : 'Published · edits save to _posts') : 'New draft');
    render();
    renderList();
  }

  // ---------- compose & save ----------
  function compose() {
    const m = cur.raw.match(/^---\n[\s\S]*?\n---\n?/);
    const head = m ? m[0] : '';
    const sep = cur.raw.slice(head.length).startsWith('\n') ? '\n' : (head ? '\n' : '');
    const text = head + sep + $('src').value;
    const note = cur.kind === 'note';
    return L.setFrontMatter(text, {
      title: $('f-title').value,
      book: note ? $('f-book').value : null,
      chapter: note ? $('f-chapter').value : null,
      image: note ? null : ($('f-image').value || null),
    });
  }

  let timer = null;
  function changed() {
    render();
    if (conflict) return;
    clearTimeout(timer);
    status('Editing…');
    timer = setTimeout(save, 800);
  }

  // Saves pending edits. Returns false if the user should stay on this post.
  async function flush() {
    if (!cur || conflict) return !conflict || confirm('Leave without resolving the conflict? Your edits stay unsaved.');
    clearTimeout(timer);
    return save();
  }

  async function save(force) {
    if (!cur) return true;
    const text = compose();
    if (cur.path && text === cur.raw) { status(cur.draft ? 'Draft' : 'Published'); return true; }
    if (!cur.path && !$('f-title').value && !$('src').value.trim()) return true; // nothing typed yet
    if (!cur.path) cur.path = `_drafts/${L.slugify($('f-slug').value) || 'untitled-' + Date.now()}.md`;
    status('Saving…');
    try {
      const r = await api('/api/save', { path: cur.path, text, mtime: cur.mtime, force: !!force });
      cur.raw = text;
      cur.mtime = r.mtime;
      showActions();
      $('f-slug').value = L.postSlug(cur.path);
      status('Saved ' + new Date().toLocaleTimeString());
      await loadLists();
      return true;
    } catch (e) {
      if (e.status === 409) {
        conflict = true;
        $('conflict').hidden = false;
        status('Changed outside the editor', true);
      } else status('Save failed: ' + e.message, true);
      return false;
    }
  }

  $('reload').onclick = () => { conflict = false; open(cur.path); };
  $('overwrite').onclick = async () => { conflict = false; $('conflict').hidden = true; await save(true); };

  // ---------- slug ----------
  async function commitSlug() {
    const want = L.slugify($('f-slug').value);
    if (!cur || !cur.path) { $('f-slug').value = want; return; }
    const have = L.postSlug(cur.path);
    if (!want || want === have) { $('f-slug').value = have; return; }
    if (!cur.draft && !confirm(`Rename the published post?\n\n/posts/${have}/ → /posts/${want}/\n\nThe old URL will stop working.`)) { $('f-slug').value = have; return; }
    if (!(await flush())) return;
    try {
      const r = await api('/api/rename', { path: cur.path, slug: want });
      const keepTitle = $('f-title').value;
      load({ path: r.path, raw: r.text, mtime: r.mtime, draft: cur.draft, kind: cur.kind });
      $('f-title').value = keepTitle;
      status('Renamed to ' + want);
      await loadLists();
    } catch (e) {
      $('f-slug').value = have;
      status('Rename failed: ' + e.message, true);
    }
  }
  const fitSlug = () => { $('f-slug').size = Math.max(14, $('f-slug').value.length + 2); };
  $('f-slug').addEventListener('input', fitSlug);
  $('f-slug').addEventListener('change', commitSlug);
  $('f-slug').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

  // ---------- preview ----------
  marked.setOptions({ gfm: true, breaks: true });
  function render() {
    if (!cur) return;
    const { data } = L.parseFrontMatter(cur.raw);
    const book = cur.kind === 'note' && books.find((b) => b.slug === $('f-book').value);
    $('p-title').textContent = $('f-title').value || 'Untitled';
    // Render block by block so each preview block knows where it starts in the source (for scroll sync).
    const tokens = marked.lexer($('src').value);
    let at = 0;
    const html = tokens.map((t) => {
      const start = at;
      at += t.raw.length;
      if (t.type === 'space') return '';
      return `<span data-src="${start}" hidden></span>` + L.arrows(marked.parser(Object.assign([t], { links: tokens.links })));
    }).join('');
    const date = (data.date || new Date().toISOString()).slice(0, 10);
    const meta = [`<time>${date}</time>`, `<span>${L.readMinutes(html)}m</span>`];
    if (book) meta.push(`<span class="meta-book"></span>`);
    $('p-meta').innerHTML = meta.join('<span class="dot">·</span>');
    if (book) $('p-meta').querySelector('.meta-book').textContent = book.title;
    const body = $('p-body');
    body.innerHTML = html;
    // Same wrapper as Jekyll so the language label and code styles apply.
    body.querySelectorAll('pre > code').forEach((code) => {
      const m = code.className.match(/language-(\S+)/);
      const lang = m ? m[1] : 'plaintext';
      const wrap = document.createElement('div');
      wrap.className = `language-${lang} highlighter-rouge`;
      if (lang !== 'plaintext') wrap.dataset.lang = lang;
      const pre = code.parentElement;
      pre.classList.add('highlight');
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
      if (window.hljs && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
    });
    // Move each marker onto the block after it, so the markers don't disturb margins.
    body.querySelectorAll('span[data-src]').forEach((s) => {
      const el = s.nextElementSibling;
      if (el && !el.dataset.src) el.dataset.src = s.dataset.src;
      s.remove();
    });
    anchors = null;
  }

  // ---------- scroll sync ----------
  // anchors: [srcY, previewY] pairs (content coordinates), one per block, ascending.
  let anchors = null;
  function buildAnchors() {
    const ta = $('src'), pv = $('preview');
    const cs = getComputedStyle(ta);
    // An off-screen copy of the textarea with markers at each block start tells us where wrapped text lands.
    const mirror = document.createElement('div');
    ['font', 'letterSpacing', 'tabSize', 'paddingLeft', 'paddingRight', 'paddingTop'].forEach((k) => { mirror.style[k] = cs[k]; });
    Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', boxSizing: 'border-box', width: ta.clientWidth + 'px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
    const blocks = [...$('p-body').querySelectorAll('[data-src]')];
    const text = ta.value;
    let last = 0;
    const marks = blocks.map((el) => {
      const i = Number(el.dataset.src);
      mirror.append(text.slice(last, i));
      last = i;
      return mirror.appendChild(document.createElement('span'));
    });
    mirror.append(text.slice(last));
    document.body.appendChild(mirror);
    const top = pv.getBoundingClientRect().top - pv.scrollTop;
    const pairs = [[0, 0]];
    blocks.forEach((el, k) => pairs.push([marks[k].offsetTop, el.getBoundingClientRect().top - top]));
    pairs.push([ta.scrollHeight, pv.scrollHeight]);
    mirror.remove();
    // Keep it monotonic in both axes so it can be inverted.
    anchors = pairs.filter((p, i) => i === 0 || (p[0] >= pairs[i - 1][0] && p[1] >= pairs[i - 1][1]));
  }
  // Piecewise-linear map from coordinate `a` to `b` (0 = source, 1 = preview).
  function mapY(y, a) {
    const b = 1 - a;
    for (let i = 1; i < anchors.length; i++) {
      const p = anchors[i - 1], q = anchors[i];
      if (y <= q[a] || i === anchors.length - 1) return q[a] === p[a] ? p[b] : p[b] + (Math.min(y, q[a]) - p[a]) * (q[b] - p[b]) / (q[a] - p[a]);
    }
    return y;
  }
  let syncing = null;
  function sync(from) {
    if (syncing === from) { syncing = null; return; }
    if (!cur || $('preview').offsetParent === null || $('write').offsetParent === null) return;
    if (!anchors) buildAnchors();
    const ta = $('src'), pv = $('preview');
    // Line up the block at the top of the textarea with the same screen height in the preview.
    const gap = ta.getBoundingClientRect().top - pv.getBoundingClientRect().top;
    const to = from === ta ? pv : ta;
    const y = from === ta ? mapY(ta.scrollTop, 0) - gap : mapY(pv.scrollTop + gap, 1);
    const max = to.scrollHeight - to.clientHeight;
    // At either end, pin the other pane to the same end.
    const want = from.scrollTop <= 0 ? 0 : from.scrollTop >= from.scrollHeight - from.clientHeight - 1 ? max : Math.round(Math.max(0, Math.min(max, y)));
    if (Math.abs(to.scrollTop - want) < 1) return;
    syncing = to;
    to.scrollTop = want;
  }
  // Show the scrollbar while a pane scrolls, then let it fade out.
  ['side', 'src', 'preview'].forEach((id) => {
    let t;
    $(id).addEventListener('scroll', (e) => {
      e.target.classList.add('scrolling');
      clearTimeout(t);
      t = setTimeout(() => e.target.classList.remove('scrolling'), 800);
    });
  });
  $('src').addEventListener('scroll', () => sync($('src')));
  $('preview').addEventListener('scroll', () => sync($('preview')));
  addEventListener('resize', () => { anchors = null; });
  // Images change the preview height once they load.
  $('p-body').addEventListener('load', () => { anchors = null; }, true);

  // ---------- formatting shortcuts ----------
  // execCommand keeps the textarea's undo history (and fires `input`, so it saves).
  function replaceSel(text, selStart, selEnd) {
    const ta = $('src');
    const base = ta.selectionStart;
    if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd); ta.dispatchEvent(new Event('input')); }
    ta.setSelectionRange(base + selStart, base + selEnd);
  }
  function wrap(mark) {
    const ta = $('src');
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, n = mark.length;
    const sel = v.slice(s, e);
    if (v.slice(s - n, s) === mark && v.slice(e, e + n) === mark) {
      // Already wrapped: take the marks off.
      ta.setSelectionRange(s - n, e + n);
      replaceSel(sel, 0, sel.length);
    } else if (sel.length > 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) {
      replaceSel(sel.slice(n, -n), 0, sel.length - 2 * n);
    } else replaceSel(mark + sel + mark, n, n + sel.length);
  }
  function link() {
    const ta = $('src');
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    // Select the url part so it can be typed over right away.
    replaceSel(`[${sel}](url)`, sel.length + 3, sel.length + 6);
  }
  // Ctrl/Cmd + key; strikethrough is Ctrl/Cmd + Shift + X.
  const shortcuts = { b: () => wrap('**'), i: () => wrap('*'), '`': () => wrap('`'), k: link, 'shift+x': () => wrap('~~') };
  // Replace [from, to) with text (undoable), then select [s, e).
  function replaceRange(from, to, text, s, e) {
    const ta = $('src');
    ta.setSelectionRange(from, to);
    if (!(text ? document.execCommand('insertText', false, text) : document.execCommand('delete'))) { ta.setRangeText(text, from, to); ta.dispatchEvent(new Event('input')); }
    ta.setSelectionRange(s, e);
  }
  // Lists: Tab / Shift+Tab nest and un-nest, Enter continues the list, Enter on an empty item ends it.
  $('src').addEventListener('keydown', (e) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const ta = $('src'), v = ta.value, s = ta.selectionStart, end = ta.selectionEnd;
    if (e.key === 'Tab') {
      e.preventDefault();
      const r = L.indentLines(v, s, end, e.shiftKey ? -1 : 1);
      if (r.text !== v.slice(r.from, r.to)) replaceRange(r.from, r.to, r.text, r.s, r.e);
    } else if (e.key === 'Enter' && s === end) {
      const from = v.lastIndexOf('\n', s - 1) + 1;
      let to = v.indexOf('\n', s); if (to < 0) to = v.length;
      const c = L.continueList(v.slice(from, to), e.shiftKey);
      if (!c) return;
      e.preventDefault();
      if (c.insert) { replaceRange(s, s, c.insert, s + c.insert.length, s + c.insert.length); return; }
      const r = c.nested ? L.indentLines(v, s, s, -1) : { from, to, text: c.line };
      replaceRange(r.from, r.to, r.text, r.from + r.text.length, r.from + r.text.length);
    }
  });
  $('src').addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const fn = shortcuts[(e.shiftKey ? 'shift+' : '') + e.key.toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  });

  // ---------- archive / delete ----------
  function showActions() {
    const saved = !!(cur && cur.path);
    $('publish').hidden = !(cur && cur.draft);
    $('archive').hidden = !(saved && !cur.draft && !cur.archived);
    $('restore').hidden = !(saved && cur.archived);
    $('delete').hidden = !saved;
  }

  function clearEditor() {
    cur = null;
    $('doc').hidden = true;
    $('empty').hidden = false;
    ['publish', 'archive', 'restore', 'delete'].forEach((id) => { $(id).hidden = true; });
    $('p-title').textContent = '';
    $('p-meta').innerHTML = '';
    $('p-body').innerHTML = '';
  }

  async function setArchived(archived) {
    const slug = L.postSlug(cur.path);
    if (archived && !confirm(`Archive this post?\n\nIt disappears from the site (/posts/${slug}/ will 404) but the file stays. You can restore it later.`)) return;
    if (!(await flush())) return;
    try {
      const r = await api('/api/archive', { path: cur.path, archived });
      load({ path: r.path, raw: r.text, mtime: r.mtime, draft: false, kind: cur.kind });
      await loadLists();
      status(archived ? 'Archived' : 'Restored');
    } catch (e) { status((archived ? 'Archive' : 'Restore') + ' failed: ' + e.message, true); }
  }

  async function deletePost() {
    const msg = cur.draft
      ? 'Delete this draft and its images?\n\nIf it was never committed, it cannot be recovered.'
      : `Delete this post and its images?\n\n/posts/${L.postSlug(cur.path)}/ will 404. A committed post can be recovered from git history.`;
    if (!confirm(msg)) return;
    clearTimeout(timer);
    try {
      await api('/api/delete', { path: cur.path });
      clearEditor();
      await loadLists();
      status('Deleted');
    } catch (e) { status('Delete failed: ' + e.message, true); }
  }

  $('archive').onclick = () => setArchived(true);
  $('restore').onclick = () => setArchived(false);
  $('delete').onclick = deletePost;

  // ---------- images ----------
  function refreshImageOptions(selected) {
    const urls = [...new Set([...$('src').value.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]))];
    if (selected && !urls.includes(selected)) urls.unshift(selected);
    $('f-image').replaceChildren(new Option('None', ''), ...urls.map((u) => new Option(u.split('/').pop(), u)));
    $('f-image').value = selected || '';
  }

  const readAsDataUrl = (file) => new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(file); });

  async function insertImage(file) {
    status('Uploading image…');
    try {
      const slug = cur.path ? L.postSlug(cur.path) : (L.slugify($('f-slug').value) || 'untitled');
      const { url } = await api('/api/upload', { slug, name: file.name, data: await readAsDataUrl(file) });
      const ta = $('src');
      const before = ta.value.slice(0, ta.selectionStart);
      const md = (before && !before.endsWith('\n') ? '\n' : '') + `![](${url})\n`;
      ta.setRangeText(md, ta.selectionStart, ta.selectionEnd, 'end');
      refreshImageOptions($('f-image').value);
      changed();
    } catch (e) { status('Upload failed: ' + e.message, true); }
  }

  const images = (list) => [...list].filter((f) => f.type.startsWith('image/'));
  $('src').addEventListener('paste', (e) => {
    const files = images(e.clipboardData.files);
    if (files.length) { e.preventDefault(); files.forEach(insertImage); }
  });
  $('src').addEventListener('dragover', (e) => { e.preventDefault(); $('src').classList.add('drag'); });
  $('src').addEventListener('dragleave', () => $('src').classList.remove('drag'));
  $('src').addEventListener('drop', (e) => {
    e.preventDefault();
    $('src').classList.remove('drag');
    images(e.dataTransfer.files).forEach(insertImage);
  });

  // ---------- books ----------
  let coverData = null;
  let editing = null; // slug of the book being edited, or null when adding
  function openBookDialog(book) {
    const f = $('book-form');
    f.reset();
    editing = book ? book.slug : null;
    coverData = null;
    f.slug.readOnly = !!book;
    f.slug.dataset.touched = book ? '1' : '';
    if (book) { f.title.value = book.title || ''; f.slug.value = book.slug; f.author.value = book.author || ''; f.publisher.value = book.publisher || ''; }
    $('book-dialog-title').textContent = book ? 'Edit book' : 'New book';
    $('book-submit').textContent = book ? 'Save' : 'Add book';
    $('cover-preview').hidden = !(book && book.cover);
    if (book && book.cover) $('cover-preview').src = book.cover;
    $('cover-hint').hidden = !!(book && book.cover);
    $('book-error').hidden = true;
    const archived = !!(book && book.archived === 'true');
    $('archive-book').hidden = !book || archived;
    $('restore-book').hidden = !archived;
    $('delete-book').hidden = !book;
    $('book-dialog').showModal();
  }

  function bookError(err) {
    $('book-error').textContent = err.message;
    $('book-error').hidden = false;
  }

  async function bookAction(url, body, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(url, body);
      $('book-dialog').close();
      await loadLists();
      status('Book updated');
    } catch (err) { bookError(err); }
  }
  $('archive-book').onclick = () => bookAction('/api/books/archive', { slug: editing, archived: true }, 'Archive this book?\n\nIt disappears from the home shelf and the Books page. Its notes stay on the site.');
  $('restore-book').onclick = () => bookAction('/api/books/archive', { slug: editing, archived: false });
  $('delete-book').onclick = () => bookAction('/api/books/delete', { slug: editing }, 'Delete this book and its cover?\n\nA committed book can be recovered from git history.');
  $('edit-book').onclick = () => {
    const book = books.find((b) => b.slug === $('f-book').value);
    if (book) openBookDialog(book);
  };
  async function setCover(file) {
    if (!file) return;
    coverData = await readAsDataUrl(file);
    $('cover-preview').src = coverData;
    $('cover-preview').hidden = false;
    $('cover-hint').hidden = true;
  }
  const drop = $('cover-drop');
  drop.addEventListener('paste', (e) => { const f = images(e.clipboardData.files)[0]; if (f) { e.preventDefault(); setCover(f); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); setCover(images(e.dataTransfer.files)[0]); });
  $('book-form').title.addEventListener('input', (e) => {
    const slug = $('book-form').slug;
    if (!slug.dataset.touched) slug.value = L.slugify(e.target.value);
  });
  $('book-form').slug.addEventListener('input', (e) => { e.target.dataset.touched = '1'; });

  $('book-form').addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') { renderBookOptions(); return; }
    e.preventDefault();
    const f = new FormData($('book-form'));
    try {
      const body = { title: f.get('title'), slug: f.get('slug'), author: f.get('author'), publisher: f.get('publisher'), cover: coverData };
      const { slug } = await api(editing ? '/api/books/update' : '/api/books', body);
      $('book-dialog').close();
      await loadLists();
      $('f-book').value = slug;
      if (!editing) { $('f-chapter').value = L.nextChapter(posts, slug); changed(); }
      else { render(); status('Book updated'); }
    } catch (err) { bookError(err); }
  });
  $('book-dialog').addEventListener('close', renderBookOptions);

  $('f-book').addEventListener('change', () => {
    if ($('f-book').value === '__new') {
      $('f-book').value = L.parseFrontMatter(cur.raw).data.book || (books[0] ? books[0].slug : '');
      openBookDialog();
      return;
    }
    if (!cur.path) $('f-chapter').value = L.nextChapter(posts, $('f-book').value);
    changed();
  });

  // ---------- layout ----------
  const closeDrawer = () => app.classList.remove('drawer');
  const wide = matchMedia('(min-width: 1200px)');
  // Wide screens fold the sidebar in place; narrower ones slide it in as a drawer.
  function toggleSide() {
    if (!wide.matches) { app.classList.toggle('drawer'); return; }
    const folded = document.documentElement.classList.toggle('side-folded');
    remember('side-folded', folded ? '1' : '0');
  }
  $('drawer-btn').onclick = toggleSide;
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleSide(); } });

  // Drag (or arrow keys on) the sidebar edge to resize it.
  const MIN_W = 180, MAX_W = 480;
  const setSideW = (w) => {
    w = Math.round(Math.min(MAX_W, Math.max(MIN_W, w)));
    document.documentElement.style.setProperty('--side-w', w + 'px');
    remember('side-w', String(w));
  };
  $('resizer').addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.body.classList.add('resizing');
    const move = (ev) => setSideW(ev.clientX);
    const up = () => { document.body.classList.remove('resizing'); removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });
  $('resizer').addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (step) { e.preventDefault(); setSideW($('side').getBoundingClientRect().width + step); }
  });
  $('scrim').onclick = closeDrawer;
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      app.dataset.tab = b.dataset.tab;
      document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    };
  });

  // ---------- wiring ----------
  $('new-article').onclick = $('empty-article').onclick = () => newPost('article');
  $('new-note').onclick = $('empty-note').onclick = () => newPost('note');
  $('filter').addEventListener('input', renderList);
  ['f-title', 'f-chapter', 'src'].forEach((id) => $(id).addEventListener('input', changed));
  $('f-image').addEventListener('change', changed);
  $('src').addEventListener('input', () => refreshImageOptions($('f-image').value));
  $('publish').onclick = async () => {
    if (!$('f-title').value.trim()) { status('Add a title before publishing', true); $('f-title').focus(); return; }
    if (!(await save())) return;
    try {
      const r = await api('/api/publish', { path: cur.path });
      await loadLists();
      await open(r.path);
      status('Published → ' + r.path + (r.git ? ' · ' + r.git : ''), !!r.git && r.git !== 'pushed');
    } catch (e) { status('Publish failed: ' + e.message, true); }
  };
  window.addEventListener('beforeunload', (e) => { if (cur && compose() !== cur.raw && cur.path) { save(); e.preventDefault(); } });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); clearTimeout(timer); save(); } });

  loadLists().then(() => {
    const p = new URLSearchParams(location.search).get('open');
    if (p) open(p);
  });
})();
