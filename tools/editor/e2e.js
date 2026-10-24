// Browser flows for the editor, driven over the Chrome DevTools Protocol.
// Runs against a temporary copy of the repo, so real posts are never touched.
// Run: node tools/editor/e2e.js   (needs google-chrome)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('./server.js');
const REPO = path.resolve(__dirname, '../..');
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-e2e-'));
for (const d of ['_posts', '_books', 'assets']) fs.cpSync(path.join(REPO, d), path.join(R, d), { recursive: true });
// Keep a fixed fixture set: the ch2-5 notes and their one book.
for (const f of fs.readdirSync(path.join(R, '_posts'))) {
  const text = fs.readFileSync(path.join(R, '_posts', f), 'utf8');
  const keep = /^book: practical-be-knowledge-for-juniors$/m.test(text) && /^chapter: [2-5]$/m.test(text);
  if (!keep) fs.rmSync(path.join(R, '_posts', f));
}
for (const f of fs.readdirSync(path.join(R, '_books'))) if (f !== 'practical-be-knowledge-for-juniors.md') fs.rmSync(path.join(R, '_books', f));
const server = createServer(R).listen(4199, '127.0.0.1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (name, cond, extra) => { if (cond) { ok++; console.log('PASS', name); } else { bad++; console.log('FAIL', name, extra || ''); } };

(async () => {
  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + path.join(R, '.chrome'), '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  // Port 0 lets Chrome pick a free port; it writes the port to DevToolsActivePort.
  const portFile = path.join(R, '.chrome', 'DevToolsActivePort');
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { const port = fs.readFileSync(portFile, 'utf8').split('\n')[0]; target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const dialogs = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Page.javascriptDialogOpening') { dialogs.push(d.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  const go = async (url) => {
    await send('Page.navigate', { url });
    for (let i = 0; i < 40; i++) { await sleep(150); try { if (await js(`return document.readyState === 'complete' && !!window.EditorLib && document.querySelectorAll('#published li, #articles li').length > 0`)) break; } catch {} }
    await sleep(600);
  };
  const type = (sel, text) => js(`const el=document.querySelector(${JSON.stringify(sel)}); el.focus(); el.value=${JSON.stringify(text)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));`);
  const read = (p) => fs.readFileSync(path.join(R, p), 'utf8');
  const exists = (p) => fs.existsSync(path.join(R, p));

  // 1. Opening a post and leaving it untouched writes nothing.
  const ch3 = '_posts/2026-09-21-ch03-db-design-and-query.md';
  const before = read(ch3); const mBefore = fs.statSync(path.join(R, ch3)).mtimeMs;
  await go('http://127.0.0.1:4199/?open=' + ch3);
  await js(`document.getElementById('src').dispatchEvent(new Event('input',{bubbles:true}))`); // simulate touch with no change
  await sleep(1500);
  check('open + no edit leaves file byte-identical', read(ch3) === before && fs.statSync(path.join(R, ch3)).mtimeMs === mBefore);

  // 1b. Sidebar groups: articles vs books, notes grouped under their book in chapter order.
  const groups = await js(`return { articles: document.getElementById('articles').textContent, book: [...document.querySelectorAll('#books .book-group')].map(g => [g.querySelector('summary').textContent, [...g.querySelectorAll('.t')].map(t => t.textContent.slice(0, 2))]) }`);
  check('book notes grouped by book in chapter order', JSON.stringify(groups.book) === JSON.stringify([['주니어 백엔드 개발자가 반드시 알아야 할 실무 지식4', ['2장', '3장', '4장', '5장']]]), JSON.stringify(groups.book));
  check('book notes not listed under articles', !groups.articles.includes('2장'));

  // 1c. Collapse / expand all book groups.
  await js(`document.getElementById('toggle-books').click()`); await sleep(100);
  check('collapse all closes every book', await js(`return [...document.querySelectorAll('#books .book-group')].every(d => !d.open) && document.getElementById('toggle-books').textContent === 'Expand all'`));
  await js(`document.getElementById('toggle-books').click()`); await sleep(100);
  check('expand all opens every book', await js(`return [...document.querySelectorAll('#books .book-group')].every(d => d.open) && document.getElementById('toggle-books').textContent === 'Collapse all'`));

  // 2. New article: type, autosave to _drafts with custom slug.
  await js(`document.getElementById('new-article').click()`); await sleep(200);
  await type('#f-slug', 'My First Draft'); await sleep(100);
  await type('#f-title', '첫 글: 테스트'); await type('#src', '첫 줄\n둘째 줄'); await sleep(1500);
  check('draft saved with slugified name', exists('_drafts/my-first-draft.md'), fs.readdirSync(path.join(R)).join(','));
  check('draft front matter + body', exists('_drafts/my-first-draft.md') && read('_drafts/my-first-draft.md') === '---\ntitle: "첫 글: 테스트"\n---\n\n첫 줄\n둘째 줄', exists('_drafts/my-first-draft.md') && JSON.stringify(read('_drafts/my-first-draft.md')));
  check('preview uses line breaks', await js(`return document.getElementById('p-body').innerHTML.includes('첫 줄<br>')`));

  // 3. Upload an image via the API path the UI uses, then rename slug: file, images, links move.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await js(`const b=await (await fetch(${JSON.stringify(png)})).blob(); const f=new File([b],'shot.png',{type:'image/png'}); const dt=new DataTransfer(); dt.items.add(f); document.getElementById('src').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));`);
  await sleep(1800);
  const draft1 = read('_drafts/my-first-draft.md');
  check('dropped image saved and linked', /!\[\]\(\/assets\/img\/posts\/my-first-draft\/\d+-shot\.png\)/.test(draft1), JSON.stringify(draft1));
  await js(`document.getElementById('f-image').value=document.getElementById('f-image').options[1].value; document.getElementById('f-image').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(1500);
  check('thumbnail chosen', /^image: \/assets\/img\/posts\/my-first-draft\//m.test(read('_drafts/my-first-draft.md')));
  await type('#f-slug', 'renamed-draft'); await sleep(1500);
  const renamed = exists('_drafts/renamed-draft.md') ? read('_drafts/renamed-draft.md') : '';
  check('rename moved draft', exists('_drafts/renamed-draft.md') && !exists('_drafts/my-first-draft.md'));
  check('rename moved images and links', exists('assets/img/posts/renamed-draft') && !renamed.includes('my-first-draft') && renamed.includes('/assets/img/posts/renamed-draft/'), JSON.stringify(renamed));

  // 4. Publish.
  await js(`document.getElementById('publish').click()`); await sleep(2000);
  const pub = fs.readdirSync(path.join(R, '_posts')).find((f) => f.endsWith('-renamed-draft.md'));
  check('published to _posts with date', !!pub && !exists('_drafts/renamed-draft.md') && /^date: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+0900$/m.test(read('_posts/' + pub)));

  // 5. Rename published post asks for confirmation and keeps date prefix.
  dialogs.length = 0;
  await type('#f-slug', 'renamed-post'); await sleep(1500);
  check('published rename confirmed with URL warning', dialogs.some((m) => m.includes('/posts/renamed-draft/') && m.includes('/posts/renamed-post/')), JSON.stringify(dialogs));
  check('published rename keeps date prefix', exists('_posts/' + pub.replace('renamed-draft', 'renamed-post')));

  // 6. Book note: new book via dialog, chapter suggestion.
  await js(`document.getElementById('new-note').click()`); await sleep(200);
  check('book note suggests next chapter', await js(`return document.getElementById('f-chapter').value`) === '6');
  await js(`const s=document.getElementById('f-book'); s.value='__new'; s.dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(200);
  await js(`const f=document.getElementById('book-form'); f.title.value='Clean Code'; f.title.dispatchEvent(new Event('input')); f.author.value='Robert C. Martin';`);
  await js(`document.querySelector('#book-form button[value=ok]').click()`); await sleep(1200);
  check('book created', exists('_books/clean-code.md') && /^author: Robert C\. Martin$/m.test(read('_books/clean-code.md')));
  check('new book selected with chapter 1', await js(`return document.getElementById('f-book').value + '/' + document.getElementById('f-chapter').value`) === 'clean-code/1');

  // 6b. Edit the book just created.
  await js(`document.getElementById('edit-book').click()`); await sleep(200);
  check('edit dialog prefilled and id locked', await js(`const f=document.getElementById('book-form'); return f.title.value==='Clean Code' && f.slug.readOnly`));
  await js(`const f=document.getElementById('book-form'); f.title.value='Clean Code 2nd'; f.publisher.value='Prentice Hall'; document.querySelector('#book-form button[value=ok]').click()`); await sleep(1000);
  check('book edited in place', /^title: Clean Code 2nd$/m.test(read('_books/clean-code.md')) && /^publisher: Prentice Hall$/m.test(read('_books/clean-code.md')));
  check('book select shows new title', await js(`return document.getElementById('f-book').selectedOptions[0].textContent`) === 'Clean Code 2nd');

  // 6c. Archive, restore and delete a book from the edit dialog.
  await js(`document.getElementById('edit-book').click()`); await sleep(200);
  await js(`document.getElementById('archive-book').click()`); await sleep(800);
  check('book archived', /^archived: true$/m.test(read('_books/clean-code.md')));
  await js(`document.getElementById('edit-book').click()`); await sleep(200);
  check('archived book offers restore', await js(`return !document.getElementById('restore-book').hidden && document.getElementById('archive-book').hidden`));
  await js(`document.getElementById('restore-book').click()`); await sleep(800);
  check('book restored', !/^archived:/m.test(read('_books/clean-code.md')));
  await js(`document.getElementById('edit-book').click()`); await sleep(200);
  dialogs.length = 0;
  await js(`document.getElementById('delete-book').click()`); await sleep(800);
  check('empty book deleted after confirm', dialogs.length === 1 && !exists('_books/clean-code.md'));
  await js(`const s=document.getElementById('f-book'); s.value='practical-be-knowledge-for-juniors'; s.dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(300);
  await js(`document.getElementById('edit-book').click()`); await sleep(200);
  await js(`document.getElementById('delete-book').click()`); await sleep(800);
  check('book with notes is not deleted and says why', exists('_books/practical-be-knowledge-for-juniors.md') && (await js(`return document.getElementById('book-error').textContent`)).includes('note'));
  await js(`document.getElementById('book-dialog').close()`);

  // 7. External change → conflict, no overwrite.
  await go('http://127.0.0.1:4199/?open=' + ch3); await sleep(500);
  fs.writeFileSync(path.join(R, ch3), before + '\nexternal\n');
  await type('#src', 'mine'); await sleep(1800);
  check('external change is not overwritten', read(ch3).endsWith('external\n'));
  check('conflict banner shown', await js(`return !document.getElementById('conflict').hidden`));

  // 8. Archive, restore and delete.
  await go('http://127.0.0.1:4199/?open=_posts/2026-09-17-ch02-slow-service.md'); await sleep(300);
  const ch2 = read('_posts/2026-09-17-ch02-slow-service.md');
  dialogs.length = 0;
  await js(`document.getElementById('archive').click()`); await sleep(1000);
  check('archive asks and adds published: false', dialogs.length === 1 && read('_posts/2026-09-17-ch02-slow-service.md') === ch2.replace(/\n---\n/, '\npublished: false\n---\n'));
  check('archived post listed under ARCHIVED', await js(`return document.getElementById('archived').textContent.includes('2장')`));
  await js(`document.getElementById('restore').click()`); await sleep(1000);
  check('restore puts the file back exactly', read('_posts/2026-09-17-ch02-slow-service.md') === ch2);
  await js(`document.getElementById('new-article').click()`); await sleep(200);
  await type('#f-slug', 'to-delete'); await type('#f-title', 'Delete me'); await sleep(1500);
  check('draft to delete exists', exists('_drafts/to-delete.md'));
  dialogs.length = 0;
  await js(`document.getElementById('delete').click()`); await sleep(1000);
  check('draft delete warns it cannot be undone', dialogs.some((m) => m.includes('cannot be recovered')), JSON.stringify(dialogs));
  check('draft deleted and editor emptied', !exists('_drafts/to-delete.md') && await js(`return !document.getElementById('empty').hidden`));

  // 8b. Scroll sync: the block at the editor's top sits at the same screen height in the preview, both ways.
  await go('http://127.0.0.1:4199/?open=' + ch3); await sleep(300);
  const synced = await js(`
    const ta = document.getElementById('src'), pv = document.getElementById('preview');
    const blocks = [...document.querySelectorAll('#p-body [data-src]')];
    ta.scrollTop = ta.scrollHeight / 2;
    await new Promise(r => setTimeout(r, 200));
    const moved = pv.scrollTop > 0;
    pv.scrollTop = 0; await new Promise(r => setTimeout(r, 200));
    return { moved, back: ta.scrollTop === 0, n: blocks.length };`);
  check('scroll sync follows in both directions', synced.moved && synced.back && synced.n > 5, JSON.stringify(synced));

  // 8c. Formatting shortcuts wrap and unwrap the selection.
  await js(`document.getElementById('new-article').click()`); await sleep(200);
  const fmt = await js(`
    const ta = document.getElementById('src'); ta.focus(); ta.value = 'hello world'; ta.setSelectionRange(6, 11);
    const key = (k, shift) => ta.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, shiftKey: !!shift, bubbles: true, cancelable: true }));
    key('b'); const a = ta.value + '|' + ta.value.slice(ta.selectionStart, ta.selectionEnd);
    key('b'); const b = ta.value;
    key('i'); const c = ta.value; key('i');
    key('\`'); const f = ta.value; key('\`');
    key('X', true); const d = ta.value; key('x', true);
    key('k'); const e = ta.value + '|' + ta.value.slice(ta.selectionStart, ta.selectionEnd);
    return [a, b, c, f, d, e];`);
  check('formatting shortcuts', JSON.stringify(fmt) === JSON.stringify(['hello **world**|world', 'hello world', 'hello *world*', 'hello \`world\`', 'hello ~~world~~', 'hello [world](url)|url']), JSON.stringify(fmt));
  // 8d. Lists, with real key presses: Enter continues, Tab nests under the item's text, Enter on empty ends.
  await js(`const ta = document.getElementById('src'); ta.focus(); ta.value = '3. Deadlock'; ta.setSelectionRange(11, 11);`);
  const press = async (key, mods = 0) => {
    const code = { Enter: 13, Tab: 9 }[key];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, modifiers: mods, ...(key === 'Enter' ? { text: '\r' } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, modifiers: mods });
  };
  const typeText = (t) => send('Input.insertText', { text: t });
  await press('Enter'); await press('Tab');
  await js(`const ta = document.getElementById('src'); const v = ta.value; ta.setSelectionRange(v.length - 3, v.length); document.execCommand('insertText', false, '- ');`);
  await typeText('예시'); await press('Enter'); await typeText('둘'); await press('Enter'); await press('Enter');
  const listText = await js(`return document.getElementById('src').value`);
  check('list keys: continue, nest under item text, end on empty', listText === '3. Deadlock\n   - 예시\n   - 둘\n- ', JSON.stringify(listText));
  check('nested list renders nested', await js(`return !!document.querySelector('#p-body ol > li > ul > li')`));
  await press('Tab', 8); // Shift+Tab at top level: nothing to un-nest
  check('shift+tab at top level is a no-op', await js(`return document.getElementById('src').value`) === listText);

  // 8e. Quotes: Enter continues `> `, lists work inside, Shift+Enter leaves an empty quote line, Enter on empty exits.
  await js(`const ta = document.getElementById('src'); ta.focus(); ta.value = ''; ta.dispatchEvent(new Event('input'))`);
  await typeText('> 인용'); await press('Enter'); await typeText('- a'); await press('Enter'); await press('Enter');
  await press('Enter', 8); await typeText('끝'); await press('Enter'); await press('Enter'); await typeText('밖');
  const quoteText = await js(`return document.getElementById('src').value`);
  check('quote keys', quoteText === '> 인용\n> - a\n> \n> 끝\n밖', JSON.stringify(quoteText));
  check('quote renders one blockquote with a list and two paragraphs', await js(`const q = document.querySelectorAll('#p-body blockquote'); return q.length === 1 && !!q[0].querySelector('ul > li') && q[0].querySelectorAll('p').length === 2`));
  await js(`document.getElementById('src').value = ''; document.getElementById('src').dispatchEvent(new Event('input'))`);

  // 9. Sidebar: drag to resize, fold and unfold, remembered across reloads.
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await js(`localStorage.clear()`); await go('http://127.0.0.1:4199/');
  const w0 = await js(`return document.getElementById('side').getBoundingClientRect().width`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(w0) - 2, y: 400, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(w0) + 100, y: 400, button: 'left' });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(w0) + 100, y: 400, button: 'left', clickCount: 1 });
  const w1 = await js(`return document.getElementById('side').getBoundingClientRect().width`);
  check('sidebar resizes by dragging its edge', Math.abs(w1 - (w0 + 102)) < 6, `${w0} -> ${w1}`);
  await js(`document.getElementById('drawer-btn').click()`); await sleep(300);
  check('sidebar folds', await js(`return document.getElementById('side').getBoundingClientRect().width`) < 2);
  await go('http://127.0.0.1:4199/'); await sleep(300);
  check('fold state is remembered', await js(`return document.getElementById('side').getBoundingClientRect().width`) < 2);
  await js(`document.getElementById('drawer-btn').click()`); await sleep(300);
  check('unfolds to the resized width', Math.abs(await js(`return document.getElementById('side').getBoundingClientRect().width`) - w1) < 6);

  // 10. Mobile tabs.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const vis = await js(`const v=(id)=>getComputedStyle(document.getElementById(id)).display!=='none'; const a=[v('write'),v('preview')]; document.querySelector('.tabs button[data-tab=preview]').click(); return a.concat([v('write'),v('preview')])`);
  check('mobile shows one pane at a time', JSON.stringify(vis) === '[true,false,false,true]', JSON.stringify(vis));

  console.log(`\n${ok} passed, ${bad} failed`);
  ws.close(); chrome.kill(); server.close();
  await new Promise((r) => chrome.on('exit', r));
  try { fs.rmSync(R, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* Chrome may still flush its cache; the OS cleans tmp */ }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
