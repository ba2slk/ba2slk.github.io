// Run: node --test tools/editor/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('./server.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function withServer(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-'));
  for (const d of ['_posts', '_books', 'assets/css']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, '_books/b.md'), '---\ntitle: Book B\nauthor: Kim\n---\n');
  fs.writeFileSync(path.join(root, '_posts/2026-01-02-n1.md'), '---\ntitle: N1\nbook: b\nchapter: 2\n---\nx\n');
  const server = createServer(root);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  };
  try { await fn({ root, call, read: (p) => fs.readFileSync(path.join(root, p), 'utf8'), exists: (p) => fs.existsSync(path.join(root, p)) }); }
  finally { server.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

test('lists posts, drafts and books', () => withServer(async ({ call }) => {
  await call('POST', '/api/save', { path: '_drafts/d1.md', text: '---\ntitle: D1\n---\n' });
  const { json: posts } = await call('GET', '/api/posts');
  assert.deepStrictEqual(posts.map((p) => [p.path, p.draft]), [['_drafts/d1.md', true], ['_posts/2026-01-02-n1.md', false]]);
  const { json: books } = await call('GET', '/api/books');
  assert.deepStrictEqual(books, [{ slug: 'b', title: 'Book B', author: 'Kim' }]);
}));

test('save refuses paths outside the allowed folders', () => withServer(async ({ call }) => {
  const r = await call('POST', '/api/save', { path: '../x.md', text: 'x' });
  assert.strictEqual(r.status, 400);
}));

test('save rejects with 409 when the file changed on disk since it was opened', () => withServer(async ({ call, root }) => {
  const { json: opened } = await call('GET', '/api/post?path=_posts/2026-01-02-n1.md');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(root, '_posts/2026-01-02-n1.md'), later, later);
  const r = await call('POST', '/api/save', { path: '_posts/2026-01-02-n1.md', text: 'mine', mtime: opened.mtime });
  assert.strictEqual(r.status, 409);
  const forced = await call('POST', '/api/save', { path: '_posts/2026-01-02-n1.md', text: 'mine', mtime: opened.mtime, force: true });
  assert.strictEqual(forced.status, 200);
}));

test('save returns the new mtime so the next save is accepted', () => withServer(async ({ call }) => {
  const a = await call('POST', '/api/save', { path: '_drafts/d.md', text: 'one' });
  const b = await call('POST', '/api/save', { path: '_drafts/d.md', text: 'two', mtime: a.json.mtime });
  assert.strictEqual(b.status, 200);
}));

test('rename moves the file, its image folder and rewrites links', () => withServer(async ({ call, read, exists }) => {
  const up = await call('POST', '/api/upload', { slug: 'old', name: 'a.png', data: PNG });
  await call('POST', '/api/save', { path: '_drafts/old.md', text: `---\ntitle: T\nimage: ${up.json.url}\n---\n![](${up.json.url})\n` });
  const r = await call('POST', '/api/rename', { path: '_drafts/old.md', slug: 'new' });
  assert.strictEqual(r.json.path, '_drafts/new.md');
  assert.ok(!exists('_drafts/old.md'));
  assert.ok(!exists('assets/img/posts/old'));
  const moved = up.json.url.replace('/old/', '/new/');
  assert.ok(exists(moved.slice(1)));
  assert.strictEqual(read('_drafts/new.md'), `---\ntitle: T\nimage: ${moved}\n---\n![](${moved})\n`);
}));

test('rename refuses to overwrite an existing post', () => withServer(async ({ call }) => {
  await call('POST', '/api/save', { path: '_drafts/a.md', text: 'a' });
  await call('POST', '/api/save', { path: '_drafts/b.md', text: 'b' });
  const r = await call('POST', '/api/rename', { path: '_drafts/a.md', slug: 'b' });
  assert.strictEqual(r.status, 400);
}));

test('publish moves a draft to _posts with a dated name and date key', () => withServer(async ({ call, read, exists }) => {
  await call('POST', '/api/save', { path: '_drafts/p.md', text: '---\ntitle: P\n---\nbody\n' });
  const r = await call('POST', '/api/publish', { path: '_drafts/p.md' });
  assert.match(r.json.path, /^_posts\/\d{4}-\d{2}-\d{2}-p\.md$/);
  assert.ok(!exists('_drafts/p.md'));
  assert.match(read(r.json.path), /^---\ntitle: P\ndate: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+0900\n---\nbody\n$/);
}));

test('upload stores the image under the post slug', () => withServer(async ({ call, exists }) => {
  const r = await call('POST', '/api/upload', { slug: 'My Post', name: 'Shot.PNG', data: PNG });
  assert.match(r.json.url, /^\/assets\/img\/posts\/my-post\/\d+-shot\.png$/);
  assert.ok(exists(r.json.url.slice(1)));
}));

test('adding a book writes _books and an optional cover', () => withServer(async ({ call, read, exists }) => {
  const r = await call('POST', '/api/books', { slug: 'Clean Code', title: 'Clean Code', author: 'Robert C. Martin', cover: PNG });
  assert.strictEqual(r.json.slug, 'clean-code');
  assert.ok(exists('assets/img/books/clean-code.png'));
  assert.match(read('_books/clean-code.md'), /^cover: \/assets\/img\/books\/clean-code\.png$/m);
  const dup = await call('POST', '/api/books', { slug: 'clean-code', title: 'X' });
  assert.strictEqual(dup.status, 400);
}));

test('a missing static file is a 404, not a crash', () => withServer(async ({ call }) => {
  const missing = await call('GET', '/assets/nope.css');
  assert.strictEqual(missing.status, 404);
  const again = await call('GET', '/api/books');
  assert.strictEqual(again.status, 200);
}));

test('archive adds published: false, restore removes it, nothing else changes', () => withServer(async ({ call, read }) => {
  const p = '_posts/2026-01-02-n1.md';
  const original = read(p);
  await call('POST', '/api/archive', { path: p, archived: true });
  assert.strictEqual(read(p), original.replace('chapter: 2\n', 'chapter: 2\npublished: false\n'));
  const { json: posts } = await call('GET', '/api/posts');
  assert.strictEqual(posts.find((x) => x.path === p).archived, true);
  await call('POST', '/api/archive', { path: p, archived: false });
  assert.strictEqual(read(p), original);
}));

test('delete removes the post and its image folder', () => withServer(async ({ call, exists }) => {
  const up = await call('POST', '/api/upload', { slug: 'gone', name: 'a.png', data: PNG });
  await call('POST', '/api/save', { path: '_drafts/gone.md', text: `![](${up.json.url})` });
  const r = await call('POST', '/api/delete', { path: '_drafts/gone.md' });
  assert.strictEqual(r.status, 200);
  assert.ok(!exists('_drafts/gone.md'));
  assert.ok(!exists('assets/img/posts/gone'));
}));

test('delete refuses files outside posts and drafts', () => withServer(async ({ call, exists }) => {
  const r = await call('POST', '/api/delete', { path: '_books/b.md' });
  assert.strictEqual(r.status, 400);
  assert.ok(exists('_books/b.md'));
}));

test('updating a book edits only changed lines and can replace the cover', () => withServer(async ({ call, read, exists }) => {
  const r = await call('POST', '/api/books/update', { slug: 'b', title: 'Book B2', author: 'Kim', publisher: 'Pub', cover: PNG });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(read('_books/b.md'), '---\ntitle: Book B2\nauthor: Kim\npublisher: Pub\ncover: /assets/img/books/b.png\n---\n');
  assert.ok(exists('assets/img/books/b.png'));
  const missing = await call('POST', '/api/books/update', { slug: 'nope', title: 'X' });
  assert.strictEqual(missing.status, 404);
}));

test('archiving a book sets archived: true and restoring removes it', () => withServer(async ({ call, read }) => {
  const before = read('_books/b.md');
  await call('POST', '/api/books/archive', { slug: 'b', archived: true });
  assert.strictEqual(read('_books/b.md'), before.replace('\n---\n', '\narchived: true\n---\n'));
  const { json: books } = await call('GET', '/api/books');
  assert.strictEqual(books[0].archived, 'true');
  await call('POST', '/api/books/archive', { slug: 'b', archived: false });
  assert.strictEqual(read('_books/b.md'), before);
}));

test('a book with notes cannot be deleted; an empty one is removed with its cover', () => withServer(async ({ call, exists }) => {
  const blocked = await call('POST', '/api/books/delete', { slug: 'b' });
  assert.strictEqual(blocked.status, 400);
  assert.match(blocked.json.error, /1 note/);
  await call('POST', '/api/books', { slug: 'lonely', title: 'Lonely', cover: PNG });
  const r = await call('POST', '/api/books/delete', { slug: 'lonely' });
  assert.strictEqual(r.status, 200);
  assert.ok(!exists('_books/lonely.md'));
  assert.ok(!exists('assets/img/books/lonely.png'));
}));
