# Minimal Custom Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chirpy gem을 제거하고, 720px 기둥의 미니멀 레이아웃을 레포 안에 직접 만든다. 다크 모드, 목차, 하이라이트, 태그·카테고리, 검색, 책 페이지를 포함한다.

**Architecture:** 순수 Jekyll 4 사이트다. `_layouts`·`_includes`·`assets/css`·`assets/js`를 레포에 둔다. 책은 `_books` 컬렉션으로 만들고, 글은 `book`/`chapter` front matter로 책과 연결한다. 검색과 목차는 빌드 시 생성한 JSON·HTML을 쓰는 바닐라 JS다. 테스트는 빌드 결과(`_site`)를 grep으로 검사하는 셸 스크립트와 기존 htmlproofer다.

**Tech Stack:** Jekyll 4.4, kramdown + Rouge, jekyll-feed, jekyll-seo-tag, jekyll-sitemap, plain CSS (Sass 미사용), vanilla JS, html-proofer.

**Spec:** `docs/superpowers/specs/2026-10-24-minimal-theme-design.md`

## Global Constraints

- 본문 기둥: `max-width: 720px`, 가운데 정렬, 좌우 패딩 24px. 모든 페이지에 적용한다.
- 폰트: Pretendard(`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`), JetBrains Mono(Google Fonts, 400·500). 고정폭은 코드, 인라인 코드, 날짜, 메타에만 쓴다.
- 기본 글자 15px / line-height 1.7. 글 본문 16px / 1.85. 포인트 색 `#2563eb` 하나.
- 코드 하이라이트에 bold 금지(`font-weight` 지정 없음).
- 테마에서 외부 리소스는 위 폰트 두 개만 쓴다. JS 라이브러리는 쓰지 않는다.
- 글 URL은 `/posts/<slug>/`로 유지한다(`permalink: /posts/:title/`).
- `_posts/2026-10-07-hello-world.md`는 수정하지 않고, 커밋에도 넣지 않는다.
- 커밋 메시지는 영어로 쓰고 Co-Authored-By 트레일러는 넣지 않는다(사용자 메모리 규칙).
- 확정 목업 값은 `.superpowers/brainstorm/86279-1792771137/content/home-minimal-720.html`, `post-page-v3.html`에 있다. 크기와 색은 여기서 복사한다.

## Review Focus

1. **description 없는 글**: 홈과 `/posts/`에서 요약 줄 없이 날짜와 제목만 나와야 한다. 빈 `<p>`가 생기면 안 된다. 검사는 Task 3의 `hello` 픽스처로 한다.
2. **책에 속하지 않은 글**: 글 머리에 책 줄이 없어야 한다. 이전·다음 버튼은 날짜순으로 동작해야 한다(Task 4).
3. **헤딩이 없는 글**: 목차 영역을 렌더하지 않아야 한다. JS 에러도 나면 안 된다(Task 5).
4. **다크 모드 첫 로드**: 저장된 값이 `dark`면 흰 화면이 번쩍이지 않아야 한다. `<head>` 인라인 스크립트로 막는다(Task 2).
5. **cover·author가 없는 책**: 책장과 책 페이지가 색 상자와 제목만으로 깨지지 않고 렌더돼야 한다(Task 6).

---

## 파일 구조

```
_config.yml                     (수정) theme 제거, permalink, collections, plugins, exclude
Gemfile                         (수정) chirpy → jekyll + 플러그인
_layouts/default.html           head, 상단 바, 푸터, 검색 모달
_layouts/home.html              이름+링크, POSTS, BOOKS
_layouts/post.html              글 머리, 본문, 목차, 이전/다음
_layouts/page.html              일반 페이지(about, posts, tags…)
_layouts/book.html              책 하나의 노트 목록
_includes/head.html             meta, 폰트, CSS, 다크모드 인라인 스크립트, seo
_includes/header.html / footer.html
_includes/post-row.html         날짜+제목+description 한 줄 (홈, /posts/, 책, 태그 공통)
_includes/book-card.html        표지(또는 색 상자)+제목+노트 수
_includes/read-time.html        읽는 시간 계산
assets/css/base.css             토큰(라이트/다크), 레이아웃, 상단 바, 목록, 책장
assets/css/prose.css            글 본문 스타일(.prose). 나중에 편집기가 재사용함
assets/css/syntax.css           Rouge 라이트/다크
assets/js/theme.js              다크 토글
assets/js/toc.js                목차 생성 + 현재 섹션 강조
assets/js/search.js             ⌘K 모달 + /search.json 필터
search.json                     빌드 시 생성
index.html, posts.md, books.md, tags.md, categories.md, about.md, 404.html
_books/practical-be-knowledge-for-juniors.md
tools/check-site.sh             _site 검사 스크립트
```

삭제: `assets/css/jekyll-theme-chirpy.scss`, `_tabs/`, `_data/contact.yml`, `_data/share.yml`, `assets/lib`(비어 있으면).

## 테스트 방식

`tools/check-site.sh`는 `bundle exec jekyll build` 후 `_site`에 대해 `assert_contains <파일> <고정 문자열>`, `assert_not_contains` 검사를 순서대로 돌린다. 실패하면 메시지를 찍고 exit 1로 끝난다. 태스크마다 검사를 추가한다(아래 "검사"). 최종 단계에서 `bash tools/test.sh`(htmlproofer)도 통과해야 한다.

---

### Task 1: Chirpy 제거와 뼈대 빌드

**Files:**
- Modify: `Gemfile`, `_config.yml`, `index.html`
- Create: `_layouts/default.html`, `_layouts/page.html`, `_includes/head.html`, `_includes/header.html`, `_includes/footer.html`, `assets/css/base.css`, `tools/check-site.sh`
- Delete: Chirpy 관련 파일(위 목록), `_tabs/about.md` → `about.md`로 이동(`layout: page`, `permalink: /about/`)

**Interfaces:**
- Produces:
  - `default` 레이아웃: `{{ content }}`를 `<main class="wrap">`에 넣는다.
  - `page` 레이아웃: `<h1 class="page-title">`와 본문.
  - CSS 토큰: `--bg --fg --muted --faint --line --accent --code-bg`. 다크 값은 `[data-theme=dark]`에서 재정의한다.
  - `tools/check-site.sh`: 함수 `assert_contains`와 `assert_not_contains`.

- [ ] **Step 1: `tools/check-site.sh` 작성(검사 함수 + 빌드)과 첫 검사 추가**
  - `_site/index.html`에 `class="wrap"`가 있다.
  - `_site/index.html`에 `jekyll-theme-chirpy`가 없다.
  - `_site/posts/ch05-async-integration/index.html`이 존재한다.
  - `_site/about/index.html`이 존재한다.
  - `_site/docs`가 존재하지 않는다.
- [ ] **Step 2: 실행해서 실패 확인** — `bash tools/check-site.sh` → `class="wrap"` FAIL
- [ ] **Step 3: Gemfile, `_config.yml`, 레이아웃 뼈대 작성**
  - Gemfile: `gem "jekyll", "~> 4.4"`, `group :jekyll_plugins`에 feed, seo-tag, sitemap. html-proofer는 유지한다.
  - `_config.yml`: `theme` 줄과 Chirpy 키를 삭제한다. `permalink: /posts/:title/`, `plugins`, `exclude: [docs, tools, .superpowers, vendor, README.md, LICENSE, Gemfile, Gemfile.lock]`, `kramdown: {input: GFM, syntax_highlighter: rouge}`를 넣는다. 그리고 `author: ba2slk`, `links: {github: https://github.com/ba2slk, velog: https://velog.io/@fundev}`를 추가한다.
  - 상단 바는 로고 "ba2slk"와 Posts / Books / Tags / About / Search 버튼(`id="search-open"`) / 테마 토글(`id="theme-toggle"`)이다.
  - 푸터는 `© {{ 'now' | date: '%Y' }} ba2slk`와 GitHub · RSS(`/feed.xml`)다.
- [ ] **Step 4: `bundle install && bash tools/check-site.sh` → PASS**
- [ ] **Step 5: Commit** — `chore: replace Chirpy with in-repo layout skeleton`

### Task 2: 다크 모드

**Files:**
- Modify: `_includes/head.html`, `assets/css/base.css`
- Create: `assets/js/theme.js`

**Interfaces:**
- Produces: `<html data-theme="light|dark">`. localStorage 키 `theme`.

- [ ] **Step 1: 검사 추가**
  - `_site/index.html`에 `localStorage.getItem('theme')`(head 인라인 스크립트)가 있다.
  - `_site/index.html`에 `id="theme-toggle"`가 있다.
  - `_site/assets/css/base.css`에 `[data-theme=dark]`가 있다.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
  - 인라인 스크립트는 CSS 링크보다 먼저 둔다. 저장값이 있으면 그 값을, 없으면 `matchMedia('(prefers-color-scheme: dark)')` 결과로 `data-theme`을 정한다. localStorage 접근은 try/catch로 감싼다.
  - `theme.js`: 토글을 누르면 `data-theme`을 반전하고 저장한다.
- [ ] **Step 4: 실행 → PASS. 수동 확인: `bash tools/run.sh`, 다크 저장 후 새로고침 시 흰 화면이 번쩍이지 않음**
- [ ] **Step 5: Commit** — `feat: add dark mode with persisted toggle`

### Task 3: 홈과 글 목록 행, 책 데이터

**Files:**
- Create: `_layouts/home.html`, `_includes/post-row.html`, `_includes/book-card.html`, `_books/practical-be-knowledge-for-juniors.md`, `posts.md`
- Modify: `_config.yml`(collections), 2~5장 글 front matter 4개

**Interfaces:**
- Produces:
  - `{% include post-row.html post=p %}`: 날짜(`.mono`, `%Y-%m-%d`)와 제목 링크, `p.description`이 있을 때만 `<p class="desc">`.
  - `{% include book-card.html book=b %}`: 표지 또는 `<div class="cover-fallback">{{ b.title }}</div>`, 제목, "노트 N"(`site.posts | where: 'book', b.slug | size`).
  - 컬렉션: `collections: {books: {output: true, permalink: /books/:name/}}`, `defaults`에서 books는 `layout: book`.
  - 글 front matter: `book: practical-be-knowledge-for-juniors`, `chapter: 2..5`, `description: "<한 줄>"`.
  - 책 front matter: `title`, `author`, `publisher`, `cover`, `description`, `link`. 현재 값은 title과 `author: 최범균`만 채운다.

- [ ] **Step 1: 검사 추가**
  - `_site/index.html`에 `POSTS`, `BOOKS`, `5장. 비동기 연동`, `https://velog.io/@fundev`, `노트 4`가 있다.
  - `_site/index.html`에 4장의 description 문자열이 있다.
  - `_site/posts/index.html`에 `2026-09-17`이 있다.
  - Review Focus #1: 홈 HTML에 `<p class="desc"></p>`가 없다.
  - Review Focus #1 픽스처: `_site/posts/index.html`에서 hello-world 행에 desc가 없다. hello-world는 로컬 미커밋 파일이라 CI에서는 없을 수 있다. 그래서 이 검사는 `_posts/2026-10-07-hello-world.md`가 있을 때만 돌린다.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
  - 홈: 이름 h1과 링크(GitHub · velog · RSS), 이어서 POSTS 최근 5개 + `ALL →`(`/posts/`), 이어서 BOOKS(노트가 1개 이상인 책만, 5칸 격자, 640px 이하에서는 3칸) + `ALL →`(`/books/`).
  - `posts.md`: 연도별 `<h2>`와 post-row 목록. 페이지네이션은 하지 않는다.
  - description 초안: 본문을 읽고 한 줄씩 쓴다(예: 4장은 "타임아웃, 재시도, 동시 요청 제한, 서킷 브레이커").
- [ ] **Step 4: 실행 → PASS**
- [ ] **Step 5: Commit** — `feat: add home page, post list and books collection`

### Task 4: 글 레이아웃과 본문 스타일, 하이라이트

**Files:**
- Create: `_layouts/post.html`, `_includes/read-time.html`, `assets/css/prose.css`, `assets/css/syntax.css`
- Modify: `_config.yml`(defaults: posts → `layout: post`)

**Interfaces:**
- Consumes: `post.book`, `post.chapter`, `site.books`
- Produces:
  - `.prose` 클래스: 본문 스타일 전부를 담고 다른 파일에 의존하지 않는다.
  - read-time: `{% include read-time.html content=content %}` → "N min read". `N = (content | strip_html | strip_newlines | size) / 500`을 올림하고, 최소 1이다.

- [ ] **Step 1: 검사 추가**
  - 3장 페이지에 `주니어 백엔드 개발자가 반드시 알아야 할 실무 지식`, `3장`, `min read`, `class="prose"`, `class="highlight"`가 있다.
  - 3장의 다음 링크가 `/posts/ch04-external-integration/`, 이전 링크가 `/posts/ch02-slow-service/`다.
  - 5장 페이지에는 다음 링크가 없다(책의 마지막 장).
  - Review Focus #2: hello-world(있을 때)에는 `class="crumb"`가 없다.
  - `syntax.css`에 `font-weight`가 없다.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
  - 글 머리: crumb(책이 있을 때만, 책 페이지 링크), h1 28px/800, 메타(mono: 날짜 · read-time · 태그 링크 `/tags/#<tag>`).
  - 이전·다음: 책이 있으면 같은 `book`의 글을 `chapter`로 정렬해 앞뒤 글을, 없으면 `page.previous`/`page.next`를 쓴다.
  - prose.css의 값은 Global Constraints와 목업 `post-page-v3.html`의 `.md` 규칙을 `.prose`로 옮긴 것이다. 언어 라벨은 Rouge가 붙이는 `div.language-xxx` 클래스를 CSS `::before` 등으로 표시한다.
  - syntax.css는 GitHub 라이트 색과 그에 대응하는 다크 색(`[data-theme=dark]`)이다.
- [ ] **Step 4: 실행 → PASS. 수동 확인: 3장을 라이트·다크 둘 다에서 열어 봄**
- [ ] **Step 5: Commit** — `feat: add post layout, prose and syntax styles`

### Task 5: 목차

**Files:**
- Create: `assets/js/toc.js`
- Modify: `_layouts/post.html`(빈 `<aside class="toc" id="toc"></aside>` + 스크립트), `assets/css/base.css`

**Interfaces:**
- Consumes: `.prose h2[id], .prose h3[id]`

- [ ] **Step 1: 검사 추가** — 3장 페이지에 `id="toc"`, `toc.js`가 있다.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
  - `toc.js`: 헤딩이 0개면 aside를 제거하고 끝낸다(Review Focus #3). 있으면 링크 목록을 만들고(h3은 `.sub`), IntersectionObserver로 현재 섹션에 `.on`을 붙인다.
  - CSS: `position:fixed; left: calc(50% + 360px + 32px); width:200px`. `@media (max-width:1239px)`에서는 숨긴다.
- [ ] **Step 4: 실행 → PASS. 수동 확인: 넓은 창에서 스크롤하면 강조가 이동하고, 좁은 창에서는 숨김**
- [ ] **Step 5: Commit** — `feat: add floating table of contents`

### Task 6: 책 페이지, 태그, 카테고리

**Files:**
- Create: `_layouts/book.html`, `books.md`, `tags.md`, `categories.md`

**Interfaces:**
- Consumes: `book-card.html`, `post-row.html`

- [ ] **Step 1: 검사 추가**
  - `_site/books/practical-be-knowledge-for-juniors/index.html`에 장 제목 4개가 2→5 순서로 있다(줄 번호 비교).
  - `_site/books/index.html`에 `book-card`가 있다.
  - `_site/tags/index.html`에 `id="backend"`가 있다.
  - `_site/categories/index.html`에 `Books`가 있다.
  - Review Focus #5: 책 페이지에 `cover-fallback`이 있다(cover가 비어 있으므로).
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
  - 책 페이지: 표지(또는 fallback), 제목, 저자·출판사(값이 있을 때만), description, link, 그 아래 장 순서의 post-row 목록.
  - 태그·카테고리: 위쪽에 이름과 개수 칩, 아래에 `<h2 id="<slug>">`별 post-row 목록.
- [ ] **Step 4: 실행 → PASS**
- [ ] **Step 5: Commit** — `feat: add book, tag and category pages`

### Task 7: 검색

**Files:**
- Create: `search.json`, `assets/js/search.js`
- Modify: `_layouts/default.html`(모달 마크업), `assets/css/base.css`

**Interfaces:**
- Produces: `/search.json` = `[{title, url, date, tags, book, content}]`. content는 `strip_html | truncate: 3000`이다.

- [ ] **Step 1: 검사 추가**
  - `_site/search.json`이 `jq` 파싱을 통과한다.
  - 길이는 `_posts` 수와 같다.
  - `서킷 브레이커`를 포함한다.
- [ ] **Step 2: 실행 → FAIL**
- [ ] **Step 3: 구현**
  - ⌘K / Ctrl+K / `#search-open` 클릭으로 모달을 열고, Esc나 바깥 클릭으로 닫는다.
  - 처음 열 때 한 번 fetch한다.
  - 입력을 공백으로 나눈 모든 단어가 title+content+tags에 들어 있는 글을 찾는다(대소문자 무시). 결과는 제목 일치를 앞에 두고 최대 10개다.
  - ↑↓와 Enter로 이동한다.
- [ ] **Step 4: 실행 → PASS. 수동 확인: "타임아웃", "GIN 인덱스" 검색**
- [ ] **Step 5: Commit** — `feat: add client-side search modal`

### Task 8: 반응형, 404, 마무리 검증

**Files:**
- Create: `404.html`
- Modify: `assets/css/base.css`

- [ ] **Step 1: 검사 추가**
  - `_site/404.html`이 있다.
  - `_site/feed.xml`이 있다.
  - `_site/sitemap.xml`이 있다.
- [ ] **Step 2: 구현**
  - 640px 이하에서 상단 메뉴 링크를 숨기고 메뉴 버튼(`<details>` 드롭다운)과 Search를 남긴다.
  - 글 행은 세로로 쌓는다.
  - h1은 24px, prose는 15.5px로 줄인다.
- [ ] **Step 3: 실행**
  - `bash tools/check-site.sh` → PASS
  - `bash tools/test.sh` → htmlproofer PASS
- [ ] **Step 4: 수동 확인**
  - `bash tools/run.sh`로 홈, 글, 책, 태그, 검색을 375px과 1440px에서 라이트·다크로 확인한다.
- [ ] **Step 5: Commit** — `feat: responsive layout, 404 and final checks`
