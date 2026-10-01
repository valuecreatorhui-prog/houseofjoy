// 링크에서 가게/상품 이름과 사진 후보를 가져옵니다. 네이버 지도는 전용 처리, 그 외는 og:image와 본문 이미지. (로그인 필요)
const { requireAuth } = require("./_lib");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const naverThumb = src => `https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=${encodeURIComponent(src)}`;
const decode = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function getHtml(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8", Accept: "text/html,*/*" }, redirect: "follow", signal: ctrl.signal });
    const text = (await r.text()).slice(0, 3_000_000);
    return { html: text, finalUrl: r.url || url };
  } finally { clearTimeout(t); }
}

/* ── 네이버 지도 ── */
async function naverPlaceId(u) {
  const direct = u.match(/(?:map\.naver\.com\/p\/(?:entry|search)\/place\/|place\.naver\.com\/[a-z]+\/)(\d{5,})/i);
  if (direct) return direct[1];
  if (/naver\.me\//i.test(u) || /map\.naver\.com/i.test(u)) {
    const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow" });
    const m = (r.url || "").match(/place\/(\d{5,})|\/(\d{5,})(?:\/|\?|$)/);
    if (m) return m[1] || m[2];
  }
  return null;
}
async function fromNaver(id) {
  const { html } = await getHtml(`https://pcmap.place.naver.com/place/${id}/home`);
  const s = html.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  const found = s.match(/https?:\/\/(?:ldb-phinf|pup-review-phinf|blogfiles|clip-service-phinf|postfiles|phinf)\.pstatic\.net\/[^"'\\\s<>]+?\.(?:jpe?g|png|JPE?G|PNG)/g) || [];
  const rank = u => /ldb-phinf/.test(u) ? 0 : /pup-review/.test(u) ? 1 : /blogfiles|postfiles/.test(u) ? 2 : 3;
  const photos = [...new Set(found)].sort((a, b) => rank(a) - rank(b)).slice(0, 18).map(src => ({ src, thumb: naverThumb(src) }));
  const nm = s.match(/"name":"([^"]{1,60})"/);
  return { source: "naver", name: nm ? nm[1] : "", photos };
}

/* ── 일반 페이지: og:image → 본문 이미지(큰 것 위주) ── */
function fromGeneric(html, base) {
  const abs = u => { try { return new URL(decode(u.trim()), base).href; } catch { return null; } };
  const metas = [];
  for (const m of html.matchAll(/<meta[^>]+>/gi)) {
    const tag = m[0]; const prop = (tag.match(/(?:property|name)=["']([^"']+)["']/i) || [])[1] || ""; const content = (tag.match(/content=["']([^"']+)["']/i) || [])[1];
    if (content && /^(og:image(:secure_url)?|twitter:image(:src)?)$/i.test(prop)) metas.push(content);
  }
  const imgs = [];
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    if (/\b(width|height)=["']?\d{1,2}\b/i.test(tag)) continue;                       // 아주 작은 아이콘
    const srcset = (tag.match(/srcset=["']([^"']+)["']/i) || [])[1];
    let best = null;
    if (srcset) best = srcset.split(",").map(x => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0]?.[0];
    best = best || (tag.match(/data-(?:src|original|lazy|zoom-image|large)=["']([^"']+)["']/i) || [])[1] || (tag.match(/\ssrc=["']([^"']+)["']/i) || [])[1];
    if (best && !/^data:/.test(best)) imgs.push(best);
  }
  const bad = /icon|logo|btn|button|sprite|blank|spacer|banner|popup|badge|arrow|loading|common\/|\/skin\/|emoticon|avatar|profile|share|sns|footer|header|nav|flag|star|cart|coupon|cupon|event|_s\.|thumb_s|\.gif(\?|$)|\.svg(\?|$)/i;
  const okExt = /\.(jpe?g|png|webp)(\?|$)/i;
  const list = [];
  for (const u of metas) { const a = abs(u); if (a) list.push(a); }
  for (const u of imgs) { const a = abs(u); if (a && okExt.test(a) && !bad.test(a)) list.push(a); }
  const photos = [...new Set(list)].slice(0, 16).map(src => ({ src, thumb: src }));
  const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
  return { source: "page", name: decode(title).replace(/\s*[|\-–:]\s*[^|\-–:]*$/, "").trim().slice(0, 60), photos };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireAuth(req, res)) return;
  try {
    let u = String((req.body || {}).url || "").trim(); if (!u) return res.status(400).json({ error: "링크를 넣어 주세요." });
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const id = /naver\.(com|me)/i.test(u) ? await naverPlaceId(u) : null;
    if (id) return res.json(await fromNaver(id));
    const { html, finalUrl } = await getHtml(u);
    const out = fromGeneric(html, finalUrl);
    if (!out.photos.length) out.note = "이 페이지에서는 사진을 찾지 못했습니다. 로그인이 필요하거나 화면을 스크립트로 그리는 사이트(인스타그램 등)는 가져올 수 없습니다.";
    res.json(out);
  } catch (e) { res.status(500).json({ error: "가져오기 실패: " + e.message + (e.cause ? ` (${e.cause.code || e.cause.message || ""})` : "") }); }
};
