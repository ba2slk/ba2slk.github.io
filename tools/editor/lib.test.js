// Run: node --test tools/editor/
const test = require('node:test');
const assert = require('node:assert');
const lib = require('./lib.js');

const POST = `---
title: "3장. 성능을 좌우하는 DB 설계와 쿼리"
date: 2026-09-21 19:12:24 +0900
categories: [Dev, Books]
description:
book: practical-be-knowledge-for-juniors
chapter: 3
---

## 본문
`;

test('parseFrontMatter reads keys and strips quotes', () => {
  const { data, body } = lib.parseFrontMatter(POST);
  assert.strictEqual(data.title, '3장. 성능을 좌우하는 DB 설계와 쿼리');
  assert.strictEqual(data.chapter, '3');
  assert.strictEqual(data.description, '');
  assert.strictEqual(body, '\n## 본문\n');
});

test('setFrontMatter with no changes returns the text unchanged', () => {
  assert.strictEqual(lib.setFrontMatter(POST, {}), POST);
  assert.strictEqual(lib.setFrontMatter(POST, { chapter: '3', book: 'practical-be-knowledge-for-juniors' }), POST);
});

test('setFrontMatter edits only the changed line and keeps the rest verbatim', () => {
  const out = lib.setFrontMatter(POST, { chapter: '4' });
  assert.strictEqual(out, POST.replace('chapter: 3', 'chapter: 4'));
});

test('setFrontMatter quotes titles that need it and keeps existing quoting style', () => {
  const out = lib.setFrontMatter(POST, { title: '새 제목: 부제' });
  assert.match(out, /^title: "새 제목: 부제"$/m);
  assert.match(out, /^categories: \[Dev, Books\]$/m);
});

test('setFrontMatter appends new keys and removes keys set to null', () => {
  const out = lib.setFrontMatter(POST, { image: '/assets/img/a.png', book: null, chapter: null });
  assert.match(out, /^image: \/assets\/img\/a\.png\n---\n/m);
  assert.doesNotMatch(out, /^book:/m);
  assert.doesNotMatch(out, /^chapter:/m);
});

test('setFrontMatter creates front matter when missing', () => {
  assert.strictEqual(lib.setFrontMatter('hello\n', { title: 'A' }), '---\ntitle: A\n---\n\nhello\n');
});

test('slugify keeps lowercase ascii, digits and dashes', () => {
  assert.strictEqual(lib.slugify('  Ch06 Cache & Queue! '), 'ch06-cache-queue');
  assert.strictEqual(lib.slugify('한글만'), '');
});

test('safePath allows only listed folders', () => {
  const root = '/repo';
  assert.strictEqual(lib.safePath(root, '_drafts/a.md', ['_drafts']), '/repo/_drafts/a.md');
  assert.throws(() => lib.safePath(root, '../etc/passwd', ['_drafts']));
  assert.throws(() => lib.safePath(root, '_drafts/../_config.yml', ['_drafts']));
  assert.throws(() => lib.safePath(root, '_draftsx/a.md', ['_drafts']));
});

test('postSlug strips folder, date prefix and extension', () => {
  assert.strictEqual(lib.postSlug('_posts/2026-09-21-ch03-db.md'), 'ch03-db');
  assert.strictEqual(lib.postSlug('_drafts/ch06-cache.md'), 'ch06-cache');
});

test('renamePlan keeps the date prefix of published posts', () => {
  assert.deepStrictEqual(lib.renamePlan('_posts/2026-09-21-old.md', 'new'), {
    from: '_posts/2026-09-21-old.md', to: '_posts/2026-09-21-new.md',
    imgFrom: 'assets/img/posts/old', imgTo: 'assets/img/posts/new',
  });
  assert.strictEqual(lib.renamePlan('_drafts/old.md', 'new').to, '_drafts/new.md');
});

test('rewriteImageLinks moves links from the old image folder to the new one', () => {
  const text = '![a](/assets/img/posts/old/1.png) ![b](/assets/img/posts/older/2.png)\nimage: /assets/img/posts/old/1.png';
  assert.strictEqual(lib.rewriteImageLinks(text, 'old', 'new'),
    '![a](/assets/img/posts/new/1.png) ![b](/assets/img/posts/older/2.png)\nimage: /assets/img/posts/new/1.png');
});

test('publishPath dates a draft with today in Seoul', () => {
  const now = new Date('2026-10-24T16:30:00Z'); // 2026-10-25 01:30 KST
  assert.strictEqual(lib.publishPath('_drafts/ch06.md', now), '_posts/2026-10-25-ch06.md');
  assert.strictEqual(lib.seoulStamp(now), '2026-10-25 01:30:00 +0900');
});

test('nextChapter is one past the highest chapter of that book', () => {
  const posts = [{ book: 'a', chapter: '2' }, { book: 'a', chapter: '5' }, { book: 'b', chapter: '9' }, { book: 'a' }];
  assert.strictEqual(lib.nextChapter(posts, 'a'), 6);
  assert.strictEqual(lib.nextChapter(posts, 'c'), 1);
});

test('readMinutes matches the blog (chars / 500, rounded up, min 1)', () => {
  assert.strictEqual(lib.readMinutes(''), 1);
  assert.strictEqual(lib.readMinutes('a'.repeat(1001)), 3);
  assert.strictEqual(lib.readMinutes('<b>' + 'a'.repeat(500) + '</b>\n'), 1);
});

test('imageName cleans the original name and prefixes a timestamp', () => {
  assert.strictEqual(lib.imageName('My Shot 1.PNG', 123), '123-my-shot-1.png');
  assert.strictEqual(lib.imageName('', 123), '123-image.png');
});

test('bookFile writes the blog book front matter', () => {
  assert.strictEqual(lib.bookFile({ title: 'Clean Code', author: 'Robert C. Martin', publisher: '', cover: '/assets/img/books/clean-code.jpg' }),
    '---\ntitle: Clean Code\nauthor: Robert C. Martin\npublisher:\ncover: /assets/img/books/clean-code.jpg\ndescription:\nlink:\n---\n');
});

test('re-saving every real post and book with its own values changes nothing', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '../..');
  for (const dir of ['_posts', '_books']) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(root, dir, f), 'utf8');
      assert.strictEqual(lib.setFrontMatter(text, lib.parseFrontMatter(text).data), text, `${dir}/${f}`);
    }
  }
});

test('arrows mirrors the blog plugin: text arrows become real ones, code is untouched', () => {
  assert.strictEqual(lib.arrows('<p>A -&gt; B &lt;- C</p><code>x -&gt; y</code><pre><code>f -&gt; g</code></pre>'),
    '<p>A → B ← C</p><code>x -&gt; y</code><pre><code>f -&gt; g</code></pre>');
});

test('booksByRecent puts the book with the newest note first, note-less books last', () => {
  const books = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
  const posts = [
    { path: '_posts/2026-01-01-x.md', book: 'a' },
    { path: '_posts/2026-03-01-y.md', book: 'b' },
    { path: '_drafts/z.md', book: 'c', draft: true },
  ];
  assert.deepStrictEqual(lib.booksByRecent(books, posts).map((b) => b.slug), ['b', 'a', 'c']);
});

test('indentLines nests a list item under the text of the item above', () => {
  const t = '3. Deadlock 피하기\n- 예시';
  const r = lib.indentLines(t, t.length, t.length, 1);
  assert.strictEqual(t.slice(0, r.from) + r.text + t.slice(r.to), '3. Deadlock 피하기\n   - 예시');
  assert.strictEqual(r.s, t.length + 3);
  // A 2-space child (not nested in Markdown) is fixed up to 3.
  const u = '3. Deadlock\n  - 예시';
  const r2 = lib.indentLines(u, u.length, u.length, 1);
  assert.strictEqual(r2.text, '   - 예시');
  // Under a bullet the child goes 2 deep; outdent goes back to the parent.
  assert.strictEqual(lib.indentLines('- a\n- b', 6, 6, 1).text, '  - b');
  assert.strictEqual(lib.indentLines('3. a\n   - b', 10, 10, -1).text, '- b');
});

test('indentLines moves a selected block together, keeping its shape', () => {
  const t = '1. a\n- b\n  - c';
  const r = lib.indentLines(t, 5, t.length, 1);
  assert.strictEqual(r.text, '   - b\n     - c');
  assert.strictEqual(lib.indentLines(r.text, 0, r.text.length, -1).text, '- b\n  - c');
});

test('continueList carries the marker to the next line', () => {
  assert.deepStrictEqual(lib.continueList('3. foo'), { insert: '\n4. ' });
  assert.deepStrictEqual(lib.continueList('   - foo'), { insert: '\n   - ' });
  assert.deepStrictEqual(lib.continueList('- [x] done'), { insert: '\n- [ ] ' });
  assert.deepStrictEqual(lib.continueList('- '), { line: '', nested: false });
  assert.deepStrictEqual(lib.continueList('   - '), { line: '', nested: true });
  assert.strictEqual(lib.continueList('plain'), null);
});

test('lists and line breaks inside a quote', () => {
  assert.deepStrictEqual(lib.continueList('> 인용'), { insert: '\n> ' });
  assert.deepStrictEqual(lib.continueList('> - a'), { insert: '\n> - ' });
  assert.deepStrictEqual(lib.continueList('> - '), { line: '> ', nested: false });
  assert.deepStrictEqual(lib.continueList('> '), { line: '' });
  assert.deepStrictEqual(lib.continueList('> ', true), { insert: '\n> ' });
  assert.strictEqual(lib.continueList('plain', true), null);
  const t = '> 1. a\n> - b';
  assert.strictEqual(lib.indentLines(t, t.length, t.length, 1).text, '>    - b');
  assert.strictEqual(lib.indentLines('> 1. a\n>    - b', 15, 15, -1).text, '> - b');
});

test('formatMarkdown fixes syntax slips and leaves code alone', () => {
  const src = [
    '#제목', '본문  ', '끝 ', '', '', '', '* a', '  + b', '>인용', '>> 깊게',
    '문단', '```py', '#not a heading   ', '* x', '```', '뒤', '## 다음',
  ].join('\n');
  assert.strictEqual(lib.formatMarkdown(src), [
    '# 제목', '', '본문  ', '끝', '', '- a', '  - b', '> 인용', '>> 깊게',
    '문단', '', '```py', '#not a heading   ', '* x', '```', '', '뒤', '', '## 다음', '',
  ].join('\n'));
});

test('formatMarkdown closes an unclosed fence and is idempotent', () => {
  const once = lib.formatMarkdown('a\n~~~\ncode\n\n\n');
  assert.strictEqual(once, 'a\n\n~~~\ncode\n~~~\n');
  assert.strictEqual(lib.formatMarkdown(once), once);
});
