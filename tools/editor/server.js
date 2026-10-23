// Local blog editor server. Run: bash tools/editor.sh
// Serves the editor app and a small file API on 127.0.0.1 only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const lib = require('./lib.js');

const WRITABLE = { post: ['_posts', '_drafts'], img: ['assets/img/posts'], book: ['_books'], cover: ['assets/img/books'] };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function createServer(root) {
  const abs = (rel, allowed) => lib.safePath(root, rel, allowed);
  const mtime = (file) => fs.statSync(file).mtimeMs;

  function list(dir) {
    const d = path.join(root, dir);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f.endsWith('.md')).sort().map((f) => {
      const { data } = lib.parseFrontMatter(fs.readFileSync(path.join(d, f), 'utf8'));
      return { path: `${dir}/${f}`, slug: lib.postSlug(f), data };
    });
  }

  function decode(dataUrl) {
    const m = String(dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/);
    if (!m) throw new HttpError(400, 'not an image');
    return { ext: m[1] === 'jpeg' ? 'jpg' : m[1], buf: Buffer.from(m[2], 'base64') };
  }

  const routes = {
    'GET /api/posts': () => [
      ...list('_drafts').map((p) => ({ ...p, draft: true })),
      ...list('_posts').reverse().map((p) => ({ ...p, draft: false })),
    ].map((p) => ({ path: p.path, slug: p.slug, title: p.data.title || p.slug, book: p.data.book || null, chapter: p.data.chapter || null, draft: p.draft, archived: p.data.published === 'false' })),

    'GET /api/books': () => list('_books').map((b) => ({ slug: b.slug, ...b.data })),

    'GET /api/post': (q) => {
      const file = abs(q.get('path'), WRITABLE.post);
      return { path: q.get('path'), text: fs.readFileSync(file, 'utf8'), mtime: mtime(file) };
    },

    'POST /api/save': ({ path: rel, text, mtime: seen, force }) => {
      const file = abs(rel, WRITABLE.post);
      if (fs.existsSync(file) && seen != null && !force && mtime(file) !== seen) throw new HttpError(409, 'changed on disk');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return { path: rel, mtime: mtime(file) };
    },

    'POST /api/rename': ({ path: rel, slug }) => {
      const clean = lib.slugify(slug);
      if (!clean) throw new HttpError(400, 'slug needs letters or digits');
      const plan = lib.renamePlan(rel, clean);
      if (plan.to === plan.from) return { path: rel };
      const from = abs(plan.from, WRITABLE.post);
      const to = abs(plan.to, WRITABLE.post);
      if (fs.existsSync(to)) throw new HttpError(400, 'a post with that slug already exists');
      const imgFrom = path.join(root, plan.imgFrom);
      const imgTo = path.join(root, plan.imgTo);
      if (fs.existsSync(imgFrom)) {
        if (fs.existsSync(imgTo)) throw new HttpError(400, 'image folder for that slug already exists');
        fs.renameSync(imgFrom, imgTo);
      }
      const text = lib.rewriteImageLinks(fs.readFileSync(from, 'utf8'), lib.postSlug(rel), clean);
      fs.writeFileSync(to, text);
      fs.unlinkSync(from);
      return { path: plan.to, text, mtime: mtime(to) };
    },

    // Archive = Jekyll's own `published: false`; the file stays where it is.
    'POST /api/archive': ({ path: rel, archived }) => {
      const file = abs(rel, ['_posts']);
      const text = lib.setFrontMatter(fs.readFileSync(file, 'utf8'), { published: archived ? 'false' : null });
      fs.writeFileSync(file, text);
      return { path: rel, mtime: mtime(file), text };
    },

    'POST /api/delete': ({ path: rel }) => {
      const file = abs(rel, WRITABLE.post);
      fs.unlinkSync(file);
      const slug = lib.postSlug(rel);
      const img = path.join(root, 'assets/img/posts', slug);
      const names = (dir) => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)) : []);
      const stillUsed = names('_posts').concat(names('_drafts')).some((f) => f.endsWith('.md') && lib.postSlug(f) === slug);
      if (fs.existsSync(img) && !stillUsed) fs.rmSync(img, { recursive: true });
      return { ok: true };
    },

    'POST /api/publish': ({ path: rel }) => {
      const from = abs(rel, ['_drafts']);
      const now = new Date();
      const toRel = lib.publishPath(rel, now);
      const to = abs(toRel, ['_posts']);
      if (fs.existsSync(to)) throw new HttpError(400, 'already published today with that slug');
      fs.writeFileSync(to, lib.setFrontMatter(fs.readFileSync(from, 'utf8'), { date: lib.seoulStamp(now) }));
      fs.unlinkSync(from);
      return { path: toRel, mtime: mtime(to) };
    },

    'POST /api/upload': ({ slug, name, data }) => {
      const { ext, buf } = decode(data);
      const base = lib.imageName(name || `image.${ext}`, Date.now());
      const rel = `assets/img/posts/${lib.slugify(slug) || 'untitled'}/${base}`;
      const file = abs(rel, WRITABLE.img);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return { url: '/' + rel };
    },

    // Edit a book's front matter in place; a new cover image replaces the old one.
    'POST /api/books/update': ({ slug, title, author, publisher, cover }) => {
      const id = lib.slugify(slug);
      const file = abs(`_books/${id}.md`, WRITABLE.book);
      if (!fs.existsSync(file)) throw new HttpError(404, 'no such book');
      if (!title) throw new HttpError(400, 'title is required');
      const changes = { title, author: author || '', publisher: publisher || '' };
      if (cover) {
        const { ext, buf } = decode(cover);
        const rel = `assets/img/books/${id}.${ext}`;
        const img = abs(rel, WRITABLE.cover);
        const old = lib.parseFrontMatter(fs.readFileSync(file, 'utf8')).data.cover;
        if (old && old !== '/' + rel) { try { fs.unlinkSync(abs(old.slice(1), WRITABLE.cover)); } catch (e) { /* already gone */ } }
        fs.mkdirSync(path.dirname(img), { recursive: true });
        fs.writeFileSync(img, buf);
        changes.cover = '/' + rel;
      }
      fs.writeFileSync(file, lib.setFrontMatter(fs.readFileSync(file, 'utf8'), changes));
      return { slug: id };
    },

    'POST /api/books/archive': ({ slug, archived }) => {
      const file = abs(`_books/${lib.slugify(slug)}.md`, WRITABLE.book);
      if (!fs.existsSync(file)) throw new HttpError(404, 'no such book');
      fs.writeFileSync(file, lib.setFrontMatter(fs.readFileSync(file, 'utf8'), { archived: archived ? 'true' : null }));
      return { slug };
    },

    // Only a book no note points at can be deleted; otherwise those notes would dangle.
    'POST /api/books/delete': ({ slug }) => {
      const id = lib.slugify(slug);
      const file = abs(`_books/${id}.md`, WRITABLE.book);
      if (!fs.existsSync(file)) throw new HttpError(404, 'no such book');
      const notes = list('_posts').concat(list('_drafts')).filter((p) => p.data.book === id).length;
      if (notes) throw new HttpError(400, `${notes} note${notes > 1 ? 's' : ''} still belong to this book. Delete or move them first, or archive the book.`);
      const cover = lib.parseFrontMatter(fs.readFileSync(file, 'utf8')).data.cover;
      if (cover) { try { fs.unlinkSync(abs(cover.slice(1), WRITABLE.cover)); } catch (e) { /* already gone */ } }
      fs.unlinkSync(file);
      return { ok: true };
    },

    'POST /api/books': ({ slug, title, author, publisher, cover }) => {
      const id = lib.slugify(slug);
      if (!id || !title) throw new HttpError(400, 'title and id are required');
      const file = abs(`_books/${id}.md`, WRITABLE.book);
      if (fs.existsSync(file)) throw new HttpError(400, 'a book with that id already exists');
      let coverUrl = '';
      if (cover) {
        const { ext, buf } = decode(cover);
        const rel = `assets/img/books/${id}.${ext}`;
        const img = abs(rel, WRITABLE.cover);
        fs.mkdirSync(path.dirname(img), { recursive: true });
        fs.writeFileSync(img, buf);
        coverUrl = '/' + rel;
      }
      fs.writeFileSync(file, lib.bookFile({ title, author, publisher, cover: coverUrl }));
      return { slug: id };
    },
  };

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 25e6) reject(new HttpError(413, 'too large')); else chunks.push(c); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new HttpError(400, 'bad json')); } });
    });
  }

  function serveFile(res, file) {
    const body = fs.readFileSync(file); // read first: a missing file must fail before headers go out
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    try {
      if (url.pathname === '/') return serveFile(res, path.join(__dirname, 'app.html'));
      if (url.pathname.startsWith('/editor/')) return serveFile(res, lib.safePath(__dirname, url.pathname.slice(8), ['.']));
      if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico') return serveFile(res, abs(url.pathname.slice(1), ['assets', '.']));
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) throw new HttpError(404, 'not found');
      json(200, await route(req.method === 'GET' ? url.searchParams : await readJson(req)));
    } catch (e) {
      const status = e.status || (e.code === 'ENOENT' ? 404 : e.message.startsWith('path not allowed') ? 400 : 500);
      json(status, { error: e.message });
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const port = Number(process.env.PORT) || 4100;
  createServer(root)
    .on('error', (e) => {
      if (e.code !== 'EADDRINUSE') throw e;
      console.error(`Port ${port} is already in use. The editor may already be running at http://127.0.0.1:${port}\nOr start on another port: PORT=4101 bash tools/editor.sh`);
      process.exit(1);
    })
    .listen(port, '127.0.0.1', () => console.log(`editor: http://127.0.0.1:${port}`));
}
