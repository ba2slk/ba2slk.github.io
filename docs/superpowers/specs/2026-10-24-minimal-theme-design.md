# Minimal custom theme (Chirpy 대체) — 설계

## 의도

이 블로그는 남에게 보여 주는 포트폴리오가 아니라 "미래의 나"를 위한 공부 기록이다.
다시 들어왔을 때 "오 잘 정리됐네"라는 반응이 나오면 성공이다.
지금은 Chirpy가 왼쪽 사이드바가 있는 무거운 레이아웃을 쓴다. 이걸
kciter.so 같은 가운데 정렬의 미니멀한 레이아웃으로 바꾼다. 다만 레퍼런스를 그대로 베끼지는 않는다.

## 목표

- Chirpy gem을 완전히 제거하고, 레포 안에 직접 만든 레이아웃·CSS·JS로 대체한다.
- 기본 기능은 빠짐없이 갖춘다. 다크 모드, 글 목차, 코드 하이라이트, 카테고리·태그 페이지, 반응형, 검색이 다 있어야 한다.
- 책 노트를 책 단위로 모아 보여 준다(책장 + 책별 페이지).
- 기존 글 URL(`/posts/<slug>/`)은 유지한다.

## 비목표

- GitHub 잔디: 검토했으나 사용자가 제외함.
- "지금 읽는 책" 카드, 자기소개 멘트, THOUGHTS 섹션, 글 썸네일
- 댓글, 애널리틱스, PWA, 공유 버튼, 조회수
- 다국어
- 브라우저 로컬 편집기(실시간 미리보기, front matter 폼, 이미지 붙여넣기). 이 작업 다음의 별도 프로젝트로 다룬다.
  편집기 미리보기가 이 테마의 CSS를 재사용할 수 있게, 글 본문 스타일(`.md` 계열)은 독립된 CSS 파일이나 블록으로 둔다.

## 안티 목표 (기술적으로 돌아가도 실패인 것)

- 레퍼런스(kciter.so)와 구분이 안 될 만큼 똑같은 모양
- 필요 없는 장식이나 문구가 늘어나는 것. "딱 필요한 것만"이 원칙이다.
- 글자가 크고 여백이 과해서 한 화면에 정보가 너무 적은 것

## 사용자가 정한 것 (목업으로 확인)

확정 목업: `.superpowers/brainstorm/86279-1792771137/content/home-minimal-720.html`(홈),
`post-page-v3.html`(글). `.superpowers/`는 gitignore 대상이라 커밋되지 않는다. 그래서 아래 수치를 기준으로 삼는다.

**공통**
- 본문 기둥 `max-width: 720px`, 가운데 정렬, 좌우 패딩 24px. 모든 페이지에 적용한다.
- 본문 글꼴은 Pretendard, 고정폭 글꼴은 JetBrains Mono다. 고정폭은 코드, 인라인 코드, 날짜, 메타 정보에 쓴다.
- 기본 글자 15px, line-height 1.7. 흰 바탕에 회색 계열 보조색, 포인트 색은 파랑(#2563eb) 하나만 쓴다.
- 상단 바: 왼쪽에 로고 "ba2slk", 오른쪽에 Posts / Books / Tags / About / Search(⌘K).
- 푸터: `© <연도> ba2slk` 오른쪽에 GitHub · RSS.

**홈**
- 이름 "ba2slk"(30px, 800)와 그 아래 링크 GitHub · velog · RSS. 소개 문구는 없다.
- POSTS: 최근 글 목록. 한 줄에 날짜(mono)와 제목(16px, 600), 그 아래 요약 한 줄. 오른쪽 위에 `ALL →`.
  요약은 글 front matter의 `description`(사람이 직접 쓴 한 줄)을 쓴다. 없으면 요약 줄 없이 날짜와 제목만 보인다(사용자 결정).
  기존 2~5장 글 4개의 `description`은 빌더가 본문을 읽고 초안을 쓴다.
- BOOKS: 표지 격자(데스크톱 5칸, 모바일 3칸). 표지 아래에 책 제목과 "노트 N". 오른쪽 위에 `ALL →`.
- 섹션 제목은 12px 대문자, letter-spacing .2em, 회색.

**글 페이지**
- 머리: 책 글이면 "<책 제목> · N장"(파랑). 그 아래 제목(28px, 800), 메타(mono: 날짜 · N min read · #태그).
- 본문 16px, line-height 1.85.
  - h2: 22px/800, 아래 구분선
  - h3: 18px/700
  - 인용: 왼쪽 3px 회색 선과 옅은 배경
  - 인라인 코드: 주황 글자에 회색 배경
  - 코드 블록: GitHub 라이트 느낌의 배경, 오른쪽 위에 언어 이름, **bold 없음**
  - 표: 가로줄만
- 목차: 화면 폭이 1240px 이상일 때만 본문 기둥 오른쪽 바깥에 고정한다. h2와 h3를 보여 주고, 현재 읽는 섹션을 강조한다. 더 좁으면 숨긴다.
- 하단: 같은 책 안의 이전 장·다음 장 버튼. 책 글이 아니면 날짜순 이전·다음 글.
- 읽는 시간: `ceil(본문 HTML 태그를 뺀 글자 수 / 500)`분, 최소 1분.

## 제약

- 배포는 GitHub Actions(`.github/workflows/pages-deploy.yml`)로 한다. 그래서 GitHub Pages safe mode 제한이 없고, 커스텀 플러그인과 gem을 쓸 수 있다.
- 워크플로의 `htmlproofer` 단계가 통과해야 한다. 깨진 내부 링크나 이미지가 있으면 안 된다.
- 테마(레이아웃·CSS·JS)의 외부 리소스는 폰트 CDN만 쓴다. Pretendard는 jsDelivr, JetBrains Mono는 Google Fonts. 글 본문 안의 이미지는 이 규칙 밖이다. 3장의 `velog.velcdn.com` 이미지는 그대로 둔다(내 판단, 이전 대화에서 "그대로 두기"로 진행함). `htmlproofer`는 `--disable-external`로 돌기 때문에 외부 링크 장애가 배포를 막지 않는다.
- `_posts/2026-10-07-hello-world.md`는 사용자의 미커밋 초안이다. 건드리지 않는다.
- 기존 `_plugins/posts-lastmod-hook.rb`는 유지한다(수정일 표시에 활용 가능).

## 책 데이터 모델 (사용자 확인됨: 책 = 카드, 누르면 장별 노트)

- 책 하나를 Jekyll 컬렉션 `_books/<id>.md` 파일 하나로 둔다. 각 책은 `/books/<id>/` 페이지를 가진다.
  front matter 필드는 `title`(필수)과 `author`, `publisher`, `cover`(이미지 경로), `description`(짧은 소개), `link`(원본·구매 링크)다. 필수가 아닌 칸은 비어 있어도 화면이 깨지지 않아야 한다.
  나중에 만들 편집기가 외부 도서 API로 이 칸들을 자동으로 채울 예정이다. 그래서 필드 이름과 형식을 이 목록에 고정한다.
- 글 front matter에 `book: <id>`, `chapter: <숫자>`를 추가한다. 책 페이지는 이 값으로 노트를 장 순서대로 나열한다.
- 현재 2~5장 글 4개를 `book: practical-be-knowledge-for-juniors`로 묶는다. 5장 글도 포함한다.
  책 정보: title `주니어 백엔드 개발자가 반드시 알아야 할 실무 지식`, author `최범균`(내 판단, 사용자 확인 필요).
- 홈의 velog 링크: `https://velog.io/@fundev`(사용자가 준 시리즈 URL에서 확인).
- 표지 이미지가 없으면 책 제목을 쓴 색 상자로 대체한다(목업과 같음).
- 노트가 0개인 책은 홈 BOOKS에 보이지 않는다.

## 페이지 목록

| 경로 | 내용 |
|---|---|
| `/` | 홈 |
| `/posts/<slug>/` | 글 (기존 URL 유지) |
| `/posts/` | 전체 글. 연도별로 묶은 날짜 + 제목 목록 |
| `/books/` | 책장 전체 |
| `/books/<id>/` | 책 하나의 장별 노트 목록 |
| `/tags/` | 태그 전체. 태그별로 글 목록을 묶고 앵커로 이동 |
| `/categories/` | 카테고리 전체. 구성은 `/tags/`와 같다 |
| `/about/` | About (`_tabs/about.md` 내용 이전) |
| `/feed.xml` | RSS |
| `/404.html` | 404 |

## 기능별 방향

- **다크 모드**: 기본은 OS 설정(`prefers-color-scheme`)을 따른다. 상단 바에 토글을 두고, 선택은 `localStorage`에 저장한다. 첫 화면 깜빡임을 막는 인라인 스크립트를 `<head>`에 넣는다. 다크 색과 코드 하이라이트 다크 색도 같이 정의한다.
- **검색**: 빌드 시 Liquid로 `/search.json`을 만든다(제목, URL, 날짜, 태그, 본문 일부). ⌘K / Ctrl+K / 상단 Search 클릭으로 모달을 열고, 클라이언트 JS로 걸러 낸다. 외부 라이브러리는 쓰지 않는다.
- **목차**: kramdown이 만든 헤딩 id를 JS로 읽어 구성한다. 현재 섹션 강조는 IntersectionObserver로 한다.
- **코드 하이라이트**: Jekyll 기본 Rouge를 쓴다. 라이트·다크 색은 직접 정의한다.
- **SEO·피드·사이트맵**: `jekyll-seo-tag`, `jekyll-feed`, `jekyll-sitemap`.
- **favicon**: 현재 `assets/img/mountain_drawing.jpg`를 쓰거나 생략한다.

## Chirpy 제거 시 같이 정리할 것

- `Gemfile`: `jekyll-theme-chirpy`를 빼고 `jekyll`과 위 플러그인을 넣는다.
- `_config.yml`: `theme:`와 Chirpy 전용 키를 정리하고, `permalink: /posts/:title/`를 명시한다.
  `docs/`, `tools/`, `.superpowers/`, `vendor/`는 `exclude`에 넣어 사이트에 나가지 않게 한다.
- `assets/css/jekyll-theme-chirpy.scss`, `_tabs/`(archives, categories, tags), `_data/contact.yml`, `_data/share.yml`을 삭제하거나 새 구조로 옮긴다.
- 글 front matter에서 Chirpy 전용 키를 쓰는 곳이 있으면 정리한다.

## 빌더에게 맡기는 것

- 파일·폴더 구성, Sass 사용 여부, JS 파일 분리 방식
- 다크 모드의 정확한 색 값. 라이트와 같은 톤을 유지한다.
- 모바일 상단 바 처리. 목업에서는 640px 아래에서 메뉴를 숨기고 Search만 남겼다. 메뉴로 가는 길은 남겨야 한다.
- `/posts/` 페이지 구성의 세부. 페이지네이션 없이 전체 목록을 보여 준다.
