/* 공용 렌더링 스크립트 — data/site.js, data/items.js 를 읽어 화면을 그립니다. */
function run() {
  const S = window.SITE, CATS = window.CATEGORIES, ITEMS = window.ITEMS, SCENES = window.SCENES || [];
  const catById = Object.fromEntries(CATS.map(c => [c.id, c]));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const imagesOf = it => (it.images && it.images.length ? it.images : (it.image ? [it.image] : []));
  const imgOf = it => imagesOf(it)[0] || "img/placeholder.svg";
  const hearts = (n, cls = "hearts") => {
    const r = Math.max(0, Math.min(5, Math.round((Number(n) || 0) * 2) / 2));
    return r ? `<span class="${cls}" aria-label="추천지수 ${r}/5">${[0, 1, 2, 3, 4].map(i => `<i class="${r >= i + 1 ? "f" : r >= i + 0.5 ? "h" : ""}"></i>`).join("")}</span>` : "";
  };
  const paras = s => String(s ?? "").split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");

  /* 헤더·푸터: 모든 페이지 공통 */
  function chrome() {
    const page = document.body.dataset.page;
    document.title = page === "home" ? `${S.name} — ${S.tagline}` : document.title.replace("{name}", S.name);
    const header = document.querySelector(".header .wrap");
    if (header) header.innerHTML = `
      <a class="brand" href="index.html">${esc(S.name)}${S.nameEn ? `<small>${esc(S.nameEn)}</small>` : ""}</a>
      <nav class="nav">
        <a href="index.html" ${page === "home" ? 'aria-current="page"' : ""}>셀렉션</a>
        <a href="about.html" ${page === "about" ? 'aria-current="page"' : ""}>소개와 기준</a>
      </nav>`;
    const footer = document.querySelector(".footer .wrap");
    if (footer) {
      const c = S.contact || {};
      const links = [
        c.instagram && `<a href="${esc(c.instagram)}" target="_blank" rel="noopener">인스타그램</a>`,
        c.kakao && `<a href="${esc(c.kakao)}" target="_blank" rel="noopener">카카오톡</a>`,
        c.email && `<a href="mailto:${esc(c.email)}">메일</a>`,
      ].filter(Boolean).join("");
      footer.innerHTML = `<div>© ${new Date().getFullYear()} ${esc(S.name)} · ${esc(S.footerNote)}</div><div class="links">${links}</div>`;
    }
  }

  function card(it) {
    return `<a class="card" href="item.html?id=${encodeURIComponent(it.id)}">
      <div class="thumb"><img src="${esc(imgOf(it))}" alt="${esc(it.name)}" loading="lazy"></div>
      <div class="body">
        <span class="cat" data-cat="${it.category}">${esc(catById[it.category]?.label || "")}</span>
        <h3>${esc(it.name)}</h3>
        <p class="one">${esc(it.oneLine)}</p>
        <div class="meta"><span>${esc(it.price || "")}</span>${hearts(it.rating)}</div>
      </div></a>`;
  }

  /* 메인 */
  function home() {
    const hero = document.getElementById("hero");
    hero.innerHTML = `<div class="rule"></div><h1>${esc(S.tagline)}</h1><p>${esc(S.intro)}</p>${S.badge ? `<div class="badge">${esc(S.badge)}</div>` : ""}`;

    const filters = document.getElementById("filters"), grid = document.getElementById("grid");
    const counts = Object.fromEntries(CATS.map(c => [c.id, ITEMS.filter(i => i.category === c.id).length]));
    const all = [{ id: "all", label: "전체" }, ...CATS];
    let current = new URLSearchParams(location.search).get("cat") || "all";
    if (!all.some(c => c.id === current)) current = "all";

    function draw() {
      filters.innerHTML = all.map(c => `<button class="chip" data-cat="${c.id}" aria-pressed="${c.id === current}">${esc(c.label)}<span class="n">${c.id === "all" ? ITEMS.length : counts[c.id]}</span></button>`).join("");
      const list = current === "all" ? ITEMS : ITEMS.filter(i => i.category === current);
      grid.innerHTML = list.length ? list.map(card).join("") : `<p class="empty">아직 이 갈래에는 고른 것이 없습니다.</p>`;
    }
    filters.addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      current = b.dataset.cat; history.replaceState(null, "", current === "all" ? "index.html" : `?cat=${current}`); draw();
    });
    draw();

    const scenes = document.getElementById("scenes");
    if (scenes) scenes.innerHTML = SCENES.map(sc => `<article class="scene">
      <div class="lead"><h3>${esc(sc.title)}</h3><p>${esc(sc.body)}</p></div>
      <div class="row">${sc.items.map(id => ITEMS.find(i => i.id === id)).filter(Boolean).map(it => `
        <a class="mini" href="item.html?id=${encodeURIComponent(it.id)}">
          <div class="thumb"><img src="${esc(imgOf(it))}" alt=""></div>
          <div><b>${esc(it.name)}</b><span>${esc(catById[it.category]?.label || "")} · ${esc(it.price || "")}</span></div>
        </a>`).join("")}</div></article>`).join("");
    if (scenes && !SCENES.length) scenes.closest("section").hidden = true;

    const crit = document.getElementById("criteria");
    if (crit) crit.innerHTML = S.criteria.map((c, i) => `<div class="c"><div class="num">0${i + 1}</div><b>${esc(c.title)}</b><p>${esc(c.body)}</p></div>`).join("");
  }

  /* 상세 */
  function item() {
    const q = new URLSearchParams(location.search), id = q.get("id");
    let it = ITEMS.find(i => i.id === id), isPreview = false;
    if (q.get("preview") === "1") {
      try { const pv = JSON.parse(localStorage.getItem("hoj_preview") || "null"); if (pv && pv.item) { it = pv.item; isPreview = true; (pv.categories || []).forEach(c => { if (!catById[c.id]) catById[c.id] = c; }); } } catch (_) {}
    }
    const root = document.getElementById("detail");
    if (isPreview) { const bar = document.createElement("div"); bar.className = "preview-bar"; bar.textContent = "미리보기 · 저장 전 모습입니다. 이 탭은 나혜님 브라우저에서만 보입니다."; document.body.prepend(bar); }
    if (!it) { root.innerHTML = `<p class="empty">찾는 항목이 없습니다. <a href="index.html">셀렉션으로 돌아가기</a></p>`; return; }
    const cat = catById[it.category] || {};
    document.title = `${it.name} — ${S.name}`;
    const facts = [["가격", it.price], ["정보", it.info]].filter(([, v]) => v);
    root.innerHTML = `
      <div class="figure${imagesOf(it).length > 1 ? " slider" : ""}">
        <div class="track">${(imagesOf(it).length ? imagesOf(it) : [imgOf(it)]).map((u, i) => `<img src="${esc(u)}" alt="${esc(it.name)} ${i + 1}" loading="${i ? "lazy" : "eager"}">`).join("")}</div>
        ${imagesOf(it).length > 1 ? `<button class="nav prev" type="button" aria-label="이전">‹</button><button class="nav next" type="button" aria-label="다음">›</button><div class="dots">${imagesOf(it).map((_, i) => `<i ${i === 0 ? 'class="on"' : ""}></i>`).join("")}</div>` : ""}
      </div>
      <div>
        <span class="cat" data-cat="${it.category}">${esc(cat.label || "")}</span>
        <h1>${esc(it.name)}</h1>
        <p class="one">${esc(it.oneLine)}</p>
        ${it.rating ? `<div class="rating">${hearts(it.rating, "hearts lg")}<span>${Math.round(it.rating * 2) / 2} / 5</span></div>` : ""}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
        ${it.opinion ? `<section class="opinion">${paras(it.opinion)}</section>` : ""}
        ${it.forWhom ? `<section class="block forwhom"><h2>이런 분께 권해요</h2><p>${esc(it.forWhom)}</p></section>` : ""}
        ${it.tags?.length ? `<div class="tags">${it.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="actions">
          ${it.link ? `<a class="btn ghost" href="${esc(it.link)}" target="_blank" rel="noopener">${/map\.naver|naver\.me|place\.naver|map\.kakao|kko\.to|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app/i.test(it.link) || it.category === "place" ? "지도에서 보기" : "자세히 보기"}</a>` : ""}
        </div>
      </div>`;

    const fig = root.querySelector(".figure.slider");
    if (fig) {
      const track = fig.querySelector(".track"), dots = [...fig.querySelectorAll(".dots i")], n = dots.length;
      const idx = () => Math.round(track.scrollLeft / track.clientWidth);
      const go = i => track.scrollTo({ left: ((i + n) % n) * track.clientWidth, behavior: "smooth" });
      fig.querySelector(".prev").addEventListener("click", () => go(idx() - 1));
      fig.querySelector(".next").addEventListener("click", () => go(idx() + 1));
      track.addEventListener("scroll", () => dots.forEach((d, i) => d.classList.toggle("on", i === idx())), { passive: true });
    }
    const rel = document.getElementById("related");
    if (isPreview) { if (rel) rel.innerHTML = ""; return; }
    const scene = SCENES.find(sc => sc.items.includes(it.id));
    const others = (scene ? scene.items.map(x => ITEMS.find(i => i.id === x)).filter(Boolean) : ITEMS.filter(i => i.category === it.category)).filter(i => i.id !== it.id).slice(0, 3);
    if (rel) rel.innerHTML = others.length ? `<h2>${scene ? `같은 장면 · ${esc(scene.title)}` : `같은 갈래의 다른 ${esc(cat.label)}`}</h2><div class="grid">${others.map(card).join("")}</div>` : "";
  }

  /* 소개 */
  function about() {
    const el = document.getElementById("about");
    el.innerHTML = `
      <div class="eyebrow">ABOUT</div>
      <h1 class="page-title">${esc(S.aboutTitle || `${S.name}은 이런 곳입니다`)}</h1>
      <div class="prose" style="margin-top:20px">
        <p>${esc(S.intro)}</p>
        ${String(S.aboutBody || "").split(/\n\s*\n/).filter(Boolean).map(t => `<p>${esc(t)}</p>`).join("")}
        ${S.owner ? `<p>운영: ${esc(S.owner)}</p>` : ""}
      </div>`;
    const crit = document.getElementById("criteria");
    if (crit) crit.innerHTML = S.criteria.map((c, i) => `<div class="c"><div class="num">0${i + 1}</div><b>${esc(c.title)}</b><p>${esc(c.body)}</p></div>`).join("");
  }

  chrome();
  ({ home, item, about }[document.body.dataset.page] || (() => {}))();
}

/* 서버(/api/data)에서 최신 데이터를 받아 그립니다. 서버가 없을 때(로컬 미리보기)는 data/items.js 를 그대로 씁니다. */
function displayOrder(items, manualOrder) {
  const t = it => Date.parse(it.publishedAt || it.createdAt || 0) || 0;
  const byDate = items.slice().sort((a, b) => t(b) - t(a));
  if (!Array.isArray(manualOrder) || !manualOrder.length) return byDate;
  const fixed = manualOrder.map(id => items.find(i => i.id === id)).filter(Boolean);
  const rest = byDate.filter(i => !manualOrder.includes(i.id));
  return [...rest, ...fixed];
}
window.displayOrder = displayOrder;
(async function boot() {
  const q = new URLSearchParams(location.search);
  let sitePreview = null;
  if (q.get("preview") === "site") { try { const pv = JSON.parse(localStorage.getItem("hoj_preview_site") || "null"); if (pv && pv.site) sitePreview = pv.site; } catch (_) {} }
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); window.CATEGORIES = d.categories; window.SCENES = d.scenes; window.ITEMS = displayOrder(d.items, d.manualOrder); if (d.site) window.SITE = { ...window.SITE, ...d.site, contact: { ...(window.SITE.contact || {}), ...(d.site.contact || {}) } }; }
  } catch (_) {}
  if (sitePreview) {
    window.SITE = { ...window.SITE, ...sitePreview, contact: { ...(window.SITE.contact || {}), ...(sitePreview.contact || {}) } };
    const bar = document.createElement("div"); bar.className = "preview-bar"; bar.textContent = "사이트 설정 미리보기 · 저장 전 모습입니다. 이 탭은 나혜님 브라우저에서만 보입니다."; document.body.prepend(bar);
    document.addEventListener("click", e => { const a = e.target.closest("a[href]"); if (!a) return; const u = new URL(a.href, location.href); if (u.origin === location.origin && /^\/(index\.html|about\.html|index|about)?$/.test(u.pathname) && !u.searchParams.get("preview")) { u.searchParams.set("preview", "site"); a.href = u.toString(); } }, true);
  }
  run();
})();
