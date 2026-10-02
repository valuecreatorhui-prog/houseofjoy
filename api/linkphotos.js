// 링크에서 가게/상품 이름과 사진 후보를 가져옵니다. 네이버 지도는 전용 처리, 그 외는 og:image와 본문 이미지. (로그인 필요)
const { requireAuth } = require("./_lib");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const naverThumb = src => `https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=${encodeURIComponent(src)}`;
const decode = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const https = require("https");
const http = require("http");
const isCertError = e => /CERT|certificate|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_TLS/i.test(String(e && (e.cause && (e.cause.code || e.cause.message) || e.code || e.message)));
function rawGet(url, insecure, hops = 0) {   // 인증서 검증을 끈 보조 요청 (중간 인증서가 빠진 쇼핑몰 등). 리다이렉트 5회까지.
  return new Promise((resolve, reject) => {
    const u = new URL(url); const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(u, { method: "GET", headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", Accept: "text/html,*/*" }, rejectUnauthorized: !insecure, timeout: 12000 }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 5) { r.resume(); return resolve(rawGet(new URL(r.headers.location, url).href, insecure, hops + 1)); }
      const chunks = []; let size = 0;
      r.on("data", c => { size += c.length; if (size < 3_000_000) chunks.push(c); }); r.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), finalUrl: url }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", reject); req.end();
  });
}
async function getHtml(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8", Accept: "text/html,*/*" }, redirect: "follow", signal: ctrl.signal });
    return { html: (await r.text()).slice(0, 3_000_000), finalUrl: r.url || url };
  } catch (e) {
    if (isCertError(e)) return rawGet(url, true);
    throw e;
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

/* ── 네이버 쇼핑(스마트스토어·브랜드스토어): 화면은 스크립트로 그리지만 HTML 안의 상품 JSON에 사진 주소가 들어 있습니다 ── */
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
async function fetchText(url, headers) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try { const r = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal }); return (await r.text()).slice(0, 3_000_000); }
  finally { clearTimeout(t); }
}
/* 네이버 쇼핑은 서버(클라우드) 접속을 자주 막습니다. 직접 받아 보고 안 되면 무료 읽기 프록시(r.jina.ai)로 한 번 더 시도합니다. */
async function naverShopHtml(url) {
  let html = "";
  try { html = await fetchText(url, { "User-Agent": MOBILE_UA, "Accept-Language": "ko-KR,ko;q=0.9", Accept: "text/html" }); } catch (_) {}
  if (!/shop-phinf\.pstatic\.net/.test(html.replace(/\\u002F/g, "/"))) {
    try { html = await fetchText("https://r.jina.ai/" + url, { "X-Return-Format": "html", "User-Agent": UA }); } catch (_) {}
  }
  return html;
}
async function fromNaverShop(url) {
  const html = await naverShopHtml(url);
  const s = html.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  const og = (s.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1];
  const found = s.match(/https?:\/\/shop-phinf\.pstatic\.net\/[^"'\\\s<>)]+?\.(?:jpe?g|png|webp)/gi) || [];
  const clean = u => u.replace(/\?.*$/, "");
  const list = [...(og ? [clean(og)] : []), ...found.map(clean)];
  const photos = [...new Set(list)].slice(0, 18).map(src => ({ src: src + "?type=o1000", thumb: src + "?type=w300" }));
  const name = (s.match(/"dispName":"([^"]{2,80})"/) || s.match(/<title>([^<]{2,80})<\/title>/i) || [])[1] || "";
  return { source: "naver-shop", name: decode(name).replace(/\s*:\s*네이버.*$/, "").slice(0, 60), photos, note: photos.length ? undefined : "네이버 쇼핑은 서버 접속을 막아 주소만으로는 못 가져옵니다. 아래 \"북마크 버튼\" 방법을 쓰거나 사진을 직접 올려 주세요." };
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
    if (/(?:smartstore|brand|m\.brand|m\.smartstore)\.naver\.com\//i.test(u)) return res.json(await fromNaverShop(u));
    const id = /naver\.(com|me)/i.test(u) ? await naverPlaceId(u) : null;
    if (id) return res.json(await fromNaver(id));
    const { html, finalUrl } = await getHtml(u);
    let out = fromGeneric(html, finalUrl);
    if (!out.photos.length) { try { out = fromGeneric(await fetchText("https://r.jina.ai/" + u, { "X-Return-Format": "html", "User-Agent": UA }), finalUrl); } catch (_) {} }
    if (!out.photos.length) out.note = "이 페이지에서는 사진을 찾지 못했습니다. 로그인이 필요하거나 화면을 스크립트로 그리는 사이트(인스타그램 등)는 가져올 수 없습니다.";
    res.json(out);
  } catch (e) { res.status(500).json({ error: "가져오기 실패: " + e.message + (e.cause ? ` (${e.cause.code || e.cause.message || ""})` : "") }); }
};
