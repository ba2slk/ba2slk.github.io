#!/usr/bin/env bash
#
# Build the site and check the generated HTML for expected content.
# Usage: bash tools/check-site.sh

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Work on a throwaway copy so fixtures never appear in the repo
# (a running `jekyll serve` would otherwise pick them up).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -C "$REPO" --exclude=.git --exclude=_site --exclude=.jekyll-cache --exclude=.superpowers --exclude=vendor -cf - . | tar -C "$WORK" -xf -
ln -s "$REPO/vendor" "$WORK/vendor"
cd "$WORK"

S=_site
fails=0

fail() { echo "FAIL: $*"; fails=$((fails + 1)); }

assert_exists() { [[ -e "$S/$1" ]] || fail "$1 does not exist"; }
assert_missing() { [[ ! -e "$S/$1" ]] || fail "$1 should not exist"; }
assert_contains() { grep -qF -- "$2" "$S/$1" 2>/dev/null || fail "$1 does not contain: $2"; }
assert_not_contains() { ! grep -qF -- "$2" "$S/$1" 2>/dev/null || fail "$1 should not contain: $2"; }

# fixture: a post whose book slug matches no book (removed after build)
FIX=_posts/2000-01-01-check-unknown-book.md
FIX2=_posts/2000-01-02-check-next.md
FIX3=_books/check-cover.md
FIX4=_books/check-nocover.md
FIXN=()
for n in 1 2 3 4 5 6; do
  f=_posts/2000-02-0$n-check-ch$n.md
  printf -- '---\ntitle: check ch%s\nbook: check-cover\nchapter: %s\n---\nbody\n' $n $n > "$f"
  FIXN+=("$f")
done
printf -- '---\ntitle: check nocover book\nauthor: Tester\n---\n' > "$FIX4"
for n in 1 2 3 4 5; do
  printf -- '---\ntitle: shelf %s\n---\n' $n > "_books/check-shelf-$n.md"
  printf -- '---\ntitle: shelf note %s\nbook: check-shelf-%s\nchapter: 1\n---\nx\n' $n $n > "_posts/2000-06-0$n-check-shelf-$n.md"
done
printf -- '---\ntitle: check archived book\narchived: true\n---\n' > _books/check-archived.md
printf -- '---\ntitle: check empty book\n---\n' > _books/check-empty.md
FIX7=_posts/2000-05-01-check-arrows.md
printf -- '---\ntitle: check arrows\n---\nA -> B <- C\n\n`x -> y`\n\n```\nfn -> int\n```\n' > "$FIX7"
FIX5=_posts/2000-03-01-check-nocover-note.md
printf -- '---\ntitle: check nocover note\nbook: check-nocover\nchapter: 1\n---\nbody\n' > "$FIX5"
printf -- '---\ntitle: check cover book\ncover: /assets/img/mountain_drawing.jpg\n---\n' > "$FIX3"
printf -- '---\ntitle: check unknown book\nbook: no-such-book\nchapter: 1\n---\nbody\n' > "$FIX"
printf -- '---\ntitle: check next\nimage: /assets/img/mountain_drawing.jpg\n---\n## heading\n\nshort\n\nThis is the first real paragraph of the fixture post body.\n' > "$FIX2"

for f in assets/js/*.js tools/editor/*.js; do node --check "$f" 2>/dev/null || fail "syntax error in $f"; done
node tools/toc.test.js || fail "toc tests"
node tools/nav.test.js || fail "nav tests"
node tools/books.test.js || fail "books tests"
node --test tools/editor/*.test.js >/dev/null 2>&1 || fail "editor tests"

bundle exec jekyll build -q || { echo "FAIL: build"; exit 1; }

# Skeleton
assert_contains index.html 'class="wrap"'
assert_contains assets/css/base.css '--content: 768px;'
assert_not_contains index.html 'jekyll-theme-chirpy'
assert_exists posts/ch05-async-integration/index.html
assert_missing about
assert_missing docs

# Light theme only
assert_not_contains index.html "data-theme"
assert_not_contains index.html "theme-toggle"
assert_not_contains assets/css/base.css "[data-theme=dark]"
assert_not_contains assets/css/syntax.css "[data-theme=dark]"
assert_missing assets/js/theme.js

# Home, post list, books
assert_contains index.html 'ARTICLES'
assert_contains index.html 'BOOKS'
assert_not_contains index.html '5장. 비동기 연동'
assert_contains index.html 'check next'
assert_not_contains index.html 'velog.io'
assert_contains index.html 'class="footer-icons"'
assert_contains index.html 'class="icon-link" href="/feed.xml" aria-label="RSS"'
assert_not_contains index.html 'book-count'
assert_not_contains index.html 'class="desc"'
assert_not_contains timeline/index.html 'class="desc"'
assert_not_contains index.html '<p class="desc"></p>'
if [[ -e _posts/2026-10-07-hello-world.md ]]; then
  # a post without description renders without a desc line
  grep -A3 'posts/hello-world/' "$S/timeline/index.html" | grep -q 'class="desc"' &&
    fail "timeline/index.html: hello-world row should have no desc"
fi

# Post layout
CH3=posts/ch03-db-design-and-query/index.html
assert_contains $CH3 '주니어 백엔드 개발자가 반드시 알아야 할 실무 지식'
assert_contains $CH3 '>8m<'
assert_contains $CH3 '>2026-09-21<'
assert_contains $CH3 'class="prose"'
assert_contains $CH3 'class="highlight"'
assert_contains $CH3 'class="pager-next" href="/posts/ch04-external-integration/"'
assert_contains $CH3 'class="pager-prev" href="/posts/ch02-slow-service/"'
assert_not_contains posts/ch05-async-integration/index.html 'class="pager-next"'
if [[ -e _posts/2026-10-07-hello-world.md ]]; then
  assert_not_contains posts/hello-world/index.html 'class="meta-book"'
fi
assert_not_contains assets/css/syntax.css 'font-weight'

# Table of contents
assert_contains $CH3 'id="toc"'
assert_contains $CH3 'toc.js'

# Books, tags, categories
# books are merged into one page: no per-book pages
assert_missing books/practical-be-knowledge-for-juniors
assert_contains books/index.html 'id="practical-be-knowledge-for-juniors"'
order=$(sed -n '/id="practical-be-knowledge-for-juniors"/,/<\/section>/p' "$S/books/index.html" | grep -o '[2-5]장\. [^<]*' | cut -c1 | tr -d '\n')
[[ $order == 2345 ]] || fail "books/index.html chapter order is '$order', expected 2345"
assert_contains books/index.html 'src="/assets/img/books/practical-be-knowledge-for-juniors.jpg"'
assert_contains books/index.html '최범균'
assert_contains index.html 'href="/books/?b=practical-be-knowledge-for-juniors"'

assert_missing tags
assert_missing categories

# Search
if jq -e . "$S/search.json" >/dev/null 2>&1; then
  n=$(jq length "$S/search.json")
  m=$(grep -L "^published: false" _posts/*.md | wc -l)
  [[ $n == "$m" ]] || fail "search.json has $n entries, expected $m"
else
  fail "search.json missing or invalid JSON"
fi
assert_contains search.json '서킷 브레이커'
assert_contains index.html 'search.js'

# 404 and feeds
assert_exists 404.html
assert_exists feed.xml
assert_exists sitemap.xml
assert_contains index.html 'class="menu"'

# Pager fallbacks and search errors
assert_contains posts/check-unknown-book/index.html 'class="pager-next" href="/posts/check-next/"'
assert_contains assets/js/search.js '.catch('

# Bookshelf: a book with a cover shows no title caption
assert_not_contains index.html 'class="book-title"' 

# Top nav: Articles, Books, Timeline, About (no dropdown)
assert_not_contains index.html 'class="dropdown'
nav=$(sed -n '/class="nav-links"/,/<\/div>/p' "$S/index.html" | grep -o 'href="[^"]*"' | tr '\n' ' ')
[[ $nav == 'href="/articles/" href="/books/" href="/timeline/" ' ]] || fail "nav order is: $nav"
assert_missing notes
assert_not_contains articles/index.html '3장. 성능을 좌우하는 DB 설계와 쿼리'
assert_contains articles/index.html 'check next'

# Year-grouped lists show month-day only
assert_contains timeline/index.html '>09/17</time>'
assert_contains index.html '>2000-01-02</time>'

assert_contains index.html 'nav.js'
assert_contains assets/css/base.css 'prefers-reduced-motion'

# Hero has no icon links (footer has them)
assert_not_contains index.html 'class="hero-links"'

# Anchor jumps scroll smoothly
assert_not_contains assets/css/base.css 'scroll-behavior: smooth'

# Reserve scrollbar space so the centered layout doesn't shift between pages
assert_contains assets/css/base.css 'scrollbar-gutter: stable'

# Books: notes paged by 5, pager only when more than 5
sec_cover=$(sed -n '/id="check-cover"/,/<\/section>/p' "$S/books/index.html")
grep -q 'data-page="1"' <<<"$sec_cover" || fail "books: 6th note should be on page 2"
grep -q 'class="notes-pager"' <<<"$sec_cover" || fail "books: book with 6 notes should have a pager"
sed -n '/id="practical-be-knowledge-for-juniors"/,/<\/section>/p' "$S/books/index.html" | grep -q 'class="notes-pager"' &&
  fail "books: book with 4 notes should have no pager"
assert_contains books/index.html 'books.js'

# Post head: small BOOK NOTE label, sky accent, gray tags
assert_not_contains $CH3 'crumb-label'
assert_contains $CH3 'class="meta-book" href="/books/?b=practical-be-knowledge-for-juniors"'
assert_not_contains $CH3 'class="post-tags"'
assert_contains assets/css/base.css '--accent: #2f7a54;'

# List hover darkens instead of underlining
assert_not_contains assets/css/base.css 'text-decoration-color: var(--line-strong)'
assert_contains assets/css/base.css '.chapters a:hover { color: var(--accent); }'
assert_contains assets/css/base.css '.post-row:hover h3 { color: var(--accent); }'
assert_contains assets/css/base.css '.tl-item:hover h3 { color: var(--accent); }'

# Non-book posts page only through other non-book posts
assert_not_contains posts/check-next/index.html 'href="/posts/check-ch1/"'
assert_not_contains posts/check-unknown-book/index.html 'class="pager-prev"'

# No divider under the post head
assert_contains assets/css/base.css '.post-head { padding: 56px 0 8px; }'


# Timeline replaces All and Tags
assert_contains timeline/index.html '5장. 비동기 연동'
assert_contains timeline/index.html 'class="kind"'
assert_contains index.html 'href="/timeline/"'
assert_not_contains index.html 'href="/tags/"'
assert_missing posts/index.html

# Timeline: line + dots, thumbnails (book cover inherited, article image)
assert_contains timeline/index.html 'class="tl-dot"'
sed -n '/href="\/posts\/ch03-db-design-and-query\/"/,/<\/a>/p' "$S/timeline/index.html" | grep -q 'class="thumb thumb-book" src="/assets/img/books/practical-be-knowledge-for-juniors.jpg"' ||
  fail "timeline: book note should inherit its book's cover"
sed -n '/href="\/posts\/check-nocover-note\/"/,/<\/a>/p' "$S/timeline/index.html" | grep -q 'class="thumb' &&
  fail "timeline: book note without a cover image should have no thumbnail"
assert_not_contains assets/css/base.css '.timeline li:first-child .tl-dot' 
sed -n '/href="\/posts\/check-next\/"/,/<\/a>/p' "$S/timeline/index.html" | grep -q 'src="/assets/img/mountain_drawing.jpg"' ||
  fail "timeline: article image should be its thumbnail"
sed -n '/href="\/posts\/check-unknown-book\/"/,/<\/a>/p' "$S/timeline/index.html" | grep -q 'class="thumb' &&
  fail "timeline: post without image or book should have no thumbnail"

# Covers and thumbnails zoom slowly on hover
assert_contains assets/css/base.css '.thumb, .book-card .cover, .book .cover { transition: transform'

# Home sections: no divider right under the section heading
assert_not_contains assets/css/base.css 'border-top: 1px solid var(--line); }'

# More room between home sections
assert_contains assets/css/base.css '.page-hero ~ section ~ section .sec { margin-top: 64px; }'
assert_contains assets/css/base.css '.page-hero { position: relative; height: 180px; }'
assert_not_contains assets/css/base.css 'rgba(0, 0, 0, .13)'

# UI strings are short English (post content excluded)
for f in index.html books/index.html 404.html timeline/index.html articles/index.html $CH3; do
  sed -e '/<article class="prose">/,/<\/article>/d' "$S/$f" | grep -vE '<title>|<meta|"headline"|"description"|application/ld\+json' |
    grep -P '[\x{AC00}-\x{D7A3}]' | grep -vE 'class="(post-row|tl-item|cover|book|meta-book|chapters)|<h[123]|<a href="/posts/|<img|book-desc|book-meta">[^<]*[A-Za-z]|alt=' |
    grep -qP '이전|다음|아직|검색|페이지|홈으로' && fail "$f: Korean UI string left"
done
assert_contains assets/js/search.js "Couldn\\'t load search."

# Faint mountain watermark in the home hero
assert_contains index.html 'class="hero-art"'
assert_contains assets/css/base.css 'mix-blend-mode: multiply'

# Watermark on every page except post reading pages
for f in articles/index.html books/index.html timeline/index.html 404.html; do
  assert_contains $f 'class="hero-art"'
done
assert_not_contains $CH3 'class="hero-art"'

# Home: no big name heading, the watermark is the hero (name kept for screen readers)
assert_contains index.html '<h1 class="page-title">ba2slk&#39;s Blog</h1>'
assert_not_contains index.html 'sr-only'

# Books: no divider right under the page hero
assert_contains assets/css/base.css '.page-hero + .page-title + .book { border-top: 0; }'

# Same hero box on every non-post page so the watermark doesn't jump
assert_contains index.html '<header class="page-hero">'
assert_not_contains index.html '<section class="hero">'

# Page title sits below the hero image, not on top of it
assert_contains articles/index.html '</header>
<h1 class="page-title">Articles</h1>'

# Emphasis order: title > section label > date
assert_contains assets/css/base.css '.sec h2 { margin: 0; font-size: 13px; letter-spacing: .14em; color: var(--faint); font-weight: 600; }'
assert_contains assets/css/base.css '  --soft: #2b313b;'

# Typographic fallback covers: tone, title, author, ridge
sec_nocover=$(sed -n '/id="check-nocover"/,/<\/section>/p' "$S/books/index.html")
grep -q 'class="cover cover-fallback tone-' <<<"$sec_nocover" || fail "books: fallback cover should carry a tone class"
grep -q 'class="cover-author">Tester<' <<<"$sec_nocover" || fail "books: fallback cover should show the author"
grep -q 'cover-ridge' <<<"$sec_nocover" && fail "books: fallback cover should have no ridge line"
assert_not_contains assets/css/base.css '#1e3a5f'

# No accent color on the book title when jumping to it
assert_not_contains assets/css/base.css '.book:target h2'

# Prose rhythm: tighter lists, headings hug their content, no empty code blocks
assert_contains assets/css/prose.css '.prose li { margin: 2px 0; line-height: 1.65; }'
assert_contains assets/css/prose.css '.prose h3 { font-size: 18px; font-weight: 700; color: var(--strong); margin: 40px 0 8px; }'
grep -Pzo '```sql\n\s*\n```' _posts/2026-09-21-ch03-db-design-and-query.md >/dev/null && fail "ch3: empty code block"

# Post images are self-hosted
assert_not_contains $CH3 'velog.velcdn.com'
assert_contains $CH3 'src="/assets/img/posts/ch03-db-design-and-query/gin-bigram.png"'

# Unfinished note removed from ch2
assert_not_contains posts/ch02-slow-service/index.html '필요한 이유'

# Home section items sit slightly inside their label
assert_contains assets/css/base.css '.sec + .post-list, .sec + .shelf, .sec + .empty { padding-left: 16px; }'

# Favicon
assert_exists favicon.ico
assert_exists assets/img/favicon/apple-touch-icon.png
assert_contains index.html 'rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon/favicon-32.png"'
assert_contains index.html 'rel="apple-touch-icon" href="/assets/img/favicon/apple-touch-icon.png"'

# A single newline is a line break (velog-style), not a joined line
FIX6=_posts/2000-04-01-check-linebreak.md
printf -- '---\ntitle: check linebreak\n---\nfirst line\nsecond line\n' > "$FIX6"
bundle exec jekyll build -q 2>/dev/null
assert_contains posts/check-linebreak/index.html 'first line<br />'
rm -f "$FIX6"

# Loose lists (blank line between items) stay as tight as normal lists
assert_contains assets/css/prose.css '.prose li > p { margin: 0; }'

# Prose line height
assert_contains assets/css/prose.css '  line-height: 1.7;'

# Logo shows the favicon mark next to the name
assert_contains index.html '<img class="logo-mark" src="/assets/img/favicon/logo-mark.png"'

# Search: icon button only, no shortcut
assert_contains index.html 'class="search-btn" id="search-open" aria-label="Search"><svg'
assert_not_contains index.html '<kbd>'
assert_not_contains assets/js/search.js "e.key.toLowerCase() === 'k'"

# Top-left logo is the mark only
assert_contains index.html 'class="logo" href="/" aria-label="ba2slk&#39;s Blog"><img class="logo-mark"'
assert_not_contains index.html 'alt="" width="24" height="17">ba2slk</a>'

# Text arrows render as real arrows, code stays untouched
assert_contains posts/check-arrows/index.html 'A → B ← C'
assert_contains posts/check-arrows/index.html '<code class="language-plaintext highlighter-rouge">x -&gt; y</code>'
assert_contains posts/check-arrows/index.html 'fn -&gt; int'
assert_contains posts/ch04-external-integration/index.html '→ 이 상태에서는'

# No font ligatures in monospace text (### and -> must show as typed)
assert_contains assets/css/base.css '.mono, code, pre, kbd, textarea { font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0; }'

# Books ordered by most recent note (books without notes last)
order=$(grep -o 'class="book" id="[^"]*"' "$S/books/index.html" | sed 's/.*id="//;s/"//' | tr '\n' ' ')
fixtures=$(tr ' ' '\n' <<<"$order" | grep -xE 'practical-be-knowledge-for-juniors|check-nocover|check-cover' | tr '\n' ' ')
[[ $fixtures == "practical-be-knowledge-for-juniors check-nocover check-cover " ]] || fail "books order is: $order"

# Hover zoom stays on its own layer (no snap when the transition ends)
assert_contains assets/css/base.css 'will-change: transform; backface-visibility: hidden; }'

# Home shows at most 5 books (one row); the rest live on /books/
shelf=$(sed -n '/<h2>BOOKS /,/<\/section>/p' "$S/index.html" | grep -c 'class="book-card"')
[[ $shelf == 5 ]] || fail "home shelf shows $shelf books, expected 5"

# Section labels show totals
a=$(grep -o '<h2>ARTICLES <span class="count">[0-9]*</span></h2>' "$S/index.html" | grep -o '[0-9]*</span>' | grep -o '[0-9]*')
[[ -n $a && $a -ge 2 ]] || fail "home ARTICLES count missing or wrong: '$a'"
b=$(grep -o '<h2>BOOKS <span class="count">[0-9]*</span></h2>' "$S/index.html" | grep -o '[0-9]*</span>' | grep -o '[0-9]*')
[[ -n $b && $b -ge 10 ]] || fail "home BOOKS count should include books beyond the 5 shown: '$b'"

# Home shelf books fade in one after another
assert_contains index.html 'class="book-card" style="--i: 0"'
assert_contains index.html 'class="book-card" style="--i: 4"'
assert_contains assets/css/base.css '@keyframes shelf-in'

# Footer sits at the bottom of short pages
assert_contains assets/css/base.css '  min-height: 100dvh;'
assert_contains assets/css/base.css 'main { flex: 1 0 auto; }'

# Books: archived books are hidden, books without notes still show
assert_not_contains books/index.html 'id="check-archived"'
assert_contains books/index.html 'id="check-empty"'
assert_not_contains index.html 'href="/books/?b=check-archived"'
# Articles page has an empty state
grep -q 'No articles yet.' articles.md || fail "articles page has no empty state"

# Covers get a soft shadow on hover
assert_contains assets/css/base.css '.book-card:hover .cover, .book-cover:hover .cover { box-shadow: 0 8px 18px -6px rgba(0, 0, 0, .18); }'

# Every button and link hover uses the accent color
for rule in '.site-nav a:hover { color: var(--accent); }' '.search-btn:hover { color: var(--accent);' '.sec a:hover { color: var(--accent); }' '.pager-btn:hover:not(:disabled) { color: var(--accent);' '.icon-link:hover { color: var(--accent); }'; do
  assert_contains assets/css/base.css "$rule"
done
grep -E ':hover[^{]*\{[^}]*color: var\(--strong\)' assets/css/base.css && fail "a hover rule still uses --strong"

# Pager hovers ease instead of snapping
assert_contains assets/css/base.css '.pager a, .pager-btn { transition: color .25s ease, border-color .25s ease, background-color .25s ease, transform .25s ease; }'

# After gliding to a book, its cover briefly shows the hover effect
assert_contains assets/css/base.css '.book.arrived .cover { transform: scale(1.05); box-shadow: 0 8px 18px -6px rgba(0, 0, 0, .18); }'
assert_contains assets/js/nav.js "book.classList.add('arrived')"

# Kill switch for the old Chirpy service worker
assert_contains sw.min.js 'registration.unregister()'

if ((fails)); then
  echo "$fails check(s) failed"
  exit 1
fi
echo "all checks passed"
