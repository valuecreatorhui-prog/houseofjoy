# House of Joy — 작은 생활 편집숍

내가 먹어보고, 써보고, 가보고 고른 **물건 · 음식 · 장소**를 이유와 함께 소개하는 사이트입니다.
서버나 빌드 없이 HTML/CSS/JS만으로 동작하며, GitHub Pages에서 바로 열립니다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `data/site.js` | 브랜드명, 소개 문구, 고르는 기준, 연락처 (여기만 고치면 사이트 전체에 반영) |
| `data/items.js` | 소개할 항목(ITEMS)과 장면(SCENES) 데이터 — **가장 자주 고치는 파일** |
| `img/` | 사진 넣는 곳. 사진이 없으면 카테고리별 기본 이미지가 대신 보입니다 |
| `index.html` | 메인 (필터 · 카드 · 장면 · 기준) |
| `item.html` | 항목 상세 (`item.html?id=항목id`) |
| `about.html` | 소개와 기준 |
| `styles.css`, `app.js` | 디자인과 화면 그리는 코드 (내용을 바꿀 땐 손댈 필요 없음) |

## 관리자 페이지에서 글 쓰기 (권장)

`https://houseofjoy.vercel.app/admin` 에서 비밀번호로 로그인합니다.

- 글(항목) 추가·수정·삭제, 사진 업로드, 추천지수(하트), 장면 묶기를 모두 화면에서 합니다.
- 저장하면 사이트에 바로 반영됩니다.
- 데이터와 사진은 Vercel Blob 저장소에 보관됩니다. 저장소에 데이터가 없으면 `data/seed.json`이 초기값으로 쓰입니다.
- 비밀번호는 Vercel 환경변수 `ADMIN_PASSWORD`에 있습니다. 바꾸려면 `vercel env rm ADMIN_PASSWORD production` 후 `vercel env add ADMIN_PASSWORD production` 으로 다시 넣고 재배포합니다.

## 구조

- 사이트 화면: `index.html`, `item.html`, `about.html` + `app.js`, `styles.css`
- 관리자: `admin.html`, `admin.js`, `admin.css`
- 서버(API, Vercel Functions): `api/login.js`(로그인), `api/logout.js`, `api/me.js`, `api/data.js`(데이터 읽기/쓰기), `api/upload.js`(사진 업로드)
- 브랜드·소개·기준·연락처: `data/site.js`

## 배포

Vercel 프로젝트 `houseofjoy`. 폴더에서 `vercel deploy --prod` 로 배포합니다.

## (참고) 로컬 미리보기

`index.html`을 브라우저로 열면 서버 없이 `data/items.js`의 예시 데이터로 화면을 볼 수 있습니다. 실제 데이터는 서버에 있으므로 `vercel dev`로 띄우면 실제 데이터로 보입니다.
