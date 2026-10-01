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

## 관리자 페이지로 추가·수정하기 (권장)

사이트 주소 뒤에 `admin.html`을 붙여 엽니다.
`https://valuecreatorhui-prog.github.io/houseofjoy/admin.html`

- 처음 한 번 GitHub 토큰을 넣습니다. 만드는 방법은 그 화면에 적혀 있습니다. (Fine-grained token, houseofjoy 저장소, Contents: Read and write)
- 항목 추가·수정·삭제, 사진 업로드, 추천지수(하트), 장면 묶기를 모두 화면에서 할 수 있습니다.
- 저장하면 GitHub에 바로 기록되고, 사이트에는 1~2분 안에 반영됩니다.
- 토큰은 그 브라우저에만 저장됩니다. 다른 기기에서는 다시 넣어야 하고, "토큰 지우기"로 지울 수 있습니다.

## 파일로 직접 추가하기

1. 사진을 `img/` 폴더에 넣습니다. (예: `img/plate-21.jpg`, 가로 4:3 권장)
2. `data/items.js`의 `ITEMS` 배열에 항목 하나를 복사해 붙이고 내용을 바꿉니다.
   - `id`: 영문·숫자·하이픈만, 겹치지 않게
   - `category`: `thing`(물건) / `food`(음식) / `place`(장소) 중 하나
   - `image`: `"img/파일명.jpg"` — 비우면 기본 이미지
   - `opinion`: 내 의견 (자유롭게. 문단을 나누려면 `\n\n`)
   - `rating`: 추천지수 1~5 (하트 5개 만점)
   - `forWhom`: 이런 분께 권해요
   - `link`: 구매처 또는 지도 링크 (없으면 비움)
3. 장면으로 묶고 싶으면 `SCENES`의 `items`에 그 `id`를 넣습니다.
4. 저장 후 GitHub에 올리면 1~2분 안에 사이트에 반영됩니다.

## 로컬에서 미리 보기

`index.html`을 브라우저로 그냥 열어도 됩니다. 또는 터미널에서:

```bash
npx serve .
```

## 배포

GitHub Pages (main 브랜치 루트) 로 배포됩니다. 파일을 고쳐 `git push` 하면 자동 반영됩니다.
