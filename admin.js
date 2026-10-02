/* 관리자: 비밀번호 로그인 후 /api 로 데이터와 사진을 저장합니다. 사진은 글당 최대 3장, 직접 올리든 링크에서 가져오든 같은 정리 과정을 거칩니다. */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const hearts = n => {
    const r = Math.max(0, Math.min(5, Math.round((Number(n) || 0) * 2) / 2));
    return r ? `<span class="hearts">${[0, 1, 2, 3, 4].map(i => `<i class="${r >= i + 1 ? "f" : r >= i + 0.5 ? "h" : ""}"></i>`).join("")}</span>` : "";
  };
  const MAX_PHOTOS = 3;
  let state = null, editingId = null, editingSceneId = null, editingCatId = null;
  let slots = [], sel = 0, cleaned = null, preset = "studio";   // slots[i] = { url, pending:{name,type,data} } | null

  /* ── API ── */
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (r.status === 401) { showLogin(); throw new Error("로그인이 필요합니다."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `${r.status}`);
    return j;
  }
  const loadData = async () => { state = await api("/api/data?all=1"); };
  /* 저장은 항상 "최신 데이터를 받아서 → 이 변경만 얹어서 → 저장" 순서로. 다른 탭이나 다른 기기에서 저장한 내용을 덮어쓰지 않습니다. */
  async function commit(apply) {
    const latest = await api("/api/data?all=1");
    apply(latest); state = latest;
    await api("/api/data", { method: "PUT", body: JSON.stringify(state) });
  }

  /* ── 이미지 변환 ── */
  function fileToJpeg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve({ name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] });
      };
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다.")); img.src = url;
    });
  }
  /* 톤 정리: 4:5 가운데 자르기, 색온도 중립화(60%), 채도·대비 완화 */
  function toneCleanBase64(base64) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const W = 1200, H = 1500, s = Math.max(W / img.width, H / img.height);
        const sw = W / s, sh = H / s, sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
        const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        const im = ctx.getImageData(0, 0, W, H), d = im.data, n = W * H;
        let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        r /= n; g /= n; b /= n; const gray = (r + g + b) / 3, k = 0.6;
        const fr = 1 + k * (gray / r - 1), fg = 1 + k * (gray / g - 1), fb = 1 + k * (gray / b - 1);
        const lum = new Float32Array(n); let li = 0;
        for (let i = 0; i < d.length; i += 4) { const R = d[i] * fr, G = d[i + 1] * fg, B = d[i + 2] * fb; lum[li++] = 0.299 * R + 0.587 * G + 0.114 * B; d[i] = R; d[i + 1] = G; d[i + 2] = B; }
        const sorted = Float32Array.from(lum).sort(); const lo = sorted[Math.floor(n * 0.005)], hi = sorted[Math.floor(n * 0.995)];
        const stretch = v => ((v - lo) / Math.max(hi - lo, 1)) * 235 + 12; const sat = 0.86;
        for (let i = 0; i < d.length; i += 4) {
          let R = stretch(d[i]), G = stretch(d[i + 1]), B = stretch(d[i + 2]); const L = 0.299 * R + 0.587 * G + 0.114 * B;
          R = L + (R - L) * sat; G = L + (G - L) * sat; B = L + (B - L) * sat;
          d[i] = Math.max(0, Math.min(255, R)); d[i + 1] = Math.max(0, Math.min(255, G)); d[i + 2] = Math.max(0, Math.min(255, B));
        }
        ctx.putImageData(im, 0, 0); resolve(c.toDataURL("image/jpeg", 0.88).split(",")[1]);
      };
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다.")); img.src = "data:image/jpeg;base64," + base64;
    });
  }
  /* 스튜디오 액자: 스튜디오 회색 배경 위에 여백을 두고 사진을 올림 */
  function frameBase64(toneB64) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const W = 1200, H = 1500, c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
        const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.8); g.addColorStop(0, "#ececec"); g.addColorStop(1, "#e3e3e3");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const pw = Math.round(W * 0.8), ph = Math.round(H * 0.8), x = (W - pw) / 2, y = (H - ph) / 2;
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.22)"; ctx.shadowBlur = 48; ctx.shadowOffsetY = 16; ctx.fillStyle = "#fff"; ctx.fillRect(x, y, pw, ph); ctx.restore();
        ctx.drawImage(img, x, y, pw, ph); resolve(c.toDataURL("image/jpeg", 0.88).split(",")[1]);
      };
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다.")); img.src = "data:image/jpeg;base64," + toneB64;
    });
  }

  /* ── UI 공통 ── */
  const msg = (el, text, cls = "") => { el.textContent = text; el.className = "msg " + cls; };
  const slug = p => { const d = new Date(), z = n => String(n).padStart(2, "0"); return `${p}-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
  const catLabel = id => (state.categories.find(c => c.id === id) || {}).label || id;
  const showPanel = w => { $("#itemForm").hidden = w !== "item"; $("#sceneForm").hidden = w !== "scene"; $("#catForm").hidden = w !== "cat"; $("#orderForm").hidden = w !== "order"; $("#siteForm").hidden = w !== "site"; $("#empty").hidden = w !== "empty"; };
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; $("#logout").hidden = true; $("#memoFab").hidden = true; $("#memo").hidden = true; $("#siteBtn").hidden = true; setTimeout(() => $("#password").focus(), 50); }
  const firstImage = it => (it.images && it.images[0]) || it.image || "";
  const tOf = it => Date.parse(it.publishedAt || it.createdAt || 0) || 0;
  function displayOrder(items, manualOrder) {   // 사이트와 같은 규칙
    const byDate = items.slice().sort((a, b) => tOf(b) - tOf(a));
    if (!Array.isArray(manualOrder) || !manualOrder.length) return byDate;
    const fixed = manualOrder.map(id => items.find(i => i.id === id)).filter(Boolean);
    return [...byDate.filter(i => !manualOrder.includes(i.id)), ...fixed];
  }
  const fmtDate = s => s ? new Date(s).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" }) : "";
  const adminOrder = () => [...state.items.filter(i => i.draft).sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0)), ...displayOrder(state.items.filter(i => !i.draft), state.manualOrder)];

  function renderList() {
    $("#count").textContent = state.items.length;
    $("#list").innerHTML = adminOrder().map(it => `
      <li data-id="${esc(it.id)}" class="${it.id === editingId ? "active" : ""}${it.draft ? " draft" : ""}">
        <div class="th">${firstImage(it) ? `<img src="${esc(firstImage(it))}" alt="">` : ""}</div>
        <div><b>${it.draft ? '<span class="tag-draft">임시</span>' : ""}${esc(it.name)}</b><small>${esc(catLabel(it.category))}${it.price ? " · " + esc(it.price) : ""}${it.publishedAt ? `<span class="date">게시 ${fmtDate(it.publishedAt)}</span>` : ""}</small></div>${hearts(it.rating)}
      </li>`).join("") || `<li class="help" style="cursor:default">아직 글이 없습니다.</li>`;
    $("#catList").innerHTML = state.categories.map(c => `
      <li data-cat="${esc(c.id)}" class="${c.id === editingCatId ? "active" : ""}">
        <div class="th" style="display:grid;place-items:center;color:var(--ink-3);font-size:11px">${state.items.filter(i => i.category === c.id).length}</div>
        <div><b>${esc(c.label)}</b><small>${esc(c.id)}</small></div><span></span>
      </li>`).join("");
    $("#sceneList").innerHTML = state.scenes.map(sc => `
      <li data-scene="${esc(sc.id)}" class="${sc.id === editingSceneId ? "active" : ""}">
        <div class="th" style="display:grid;place-items:center;color:var(--ink-3);font-size:11px">${sc.items.length}</div>
        <div><b>${esc(sc.title)}</b><small>${esc(sc.body || "")}</small></div><span></span>
      </li>`).join("") || `<li class="help" style="cursor:default">장면이 없습니다.</li>`;
  }

  /* ── 사진 슬롯 ── */
  const slotSrc = s => s ? (s.pending ? "data:image/jpeg;base64," + s.pending.data : s.url) : "";
  function renderSlots() {
    $("#slots").querySelectorAll(".slot").forEach((el, i) => {
      const s = slots[i]; el.classList.toggle("on", i === sel); el.classList.toggle("filled", !!s);
      el.innerHTML = s ? `<img src="${esc(slotSrc(s))}" alt="">${i === 0 ? '<span class="badge">대표</span>' : ""}` : "<span>+</span>";
    });
    const has = !!slots[sel];
    $("#cleanBtn").hidden = !has; $("#toneBtn").hidden = !has; $("#imgClear").hidden = !has;
  }
  function selectSlot(i) { sel = i; $("#compare").hidden = true; cleaned = null; renderSlots(); }
  function firstEmptySlot() { const i = slots.findIndex(s => !s); return i < 0 ? sel : i; }
  function putPhoto(pending) { // 새 사진을 선택한 칸(비어 있으면) 또는 첫 빈 칸에
    formDirty = true; const i = slots[sel] ? firstEmptySlot() : sel; sel = i; slots[i] = { url: "", pending }; renderSlots(); autoClean();
  }
  async function currentImageBase64() {
    const s = slots[sel]; if (!s) return null;
    if (s.pending) return s.pending.data;
    const blob = await (await fetch(s.url, { cache: "no-store" })).blob();
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function setRating(v) {
    v = Math.max(0, Math.min(5, Math.round(v * 2) / 2)); $("#rating").value = v;
    $("#heartpick").querySelectorAll("button").forEach(b => { const i = Number(b.dataset.v) - 1; b.classList.toggle("f", v >= i + 1); b.classList.toggle("h", v < i + 1 && v >= i + 0.5); });
    $("#ratingLabel").textContent = v ? `${v} / 5` : "선택 안 함";
  }

  /* ── 정리: 배경(물건) / 스튜디오 액자(그 외) ── */
  function showCompare(before, after, label, withPresets) {
    $("#cmpLabel").textContent = label; $("#presets").hidden = !withPresets;
    $("#cmpBefore").src = "data:image/jpeg;base64," + before; $("#cmpAfter").src = "data:image/jpeg;base64," + after; $("#compare").hidden = false;
  }
  async function cleanBackground() {
    const btn = $("#cleanBtn"); btn.disabled = true; btn.textContent = "정리 중…"; msg($("#formMsg"), "");
    try {
      const data = await currentImageBase64(); if (!data) throw new Error("사진이 없습니다.");
      const r = await fetch("/api/cutout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, preset }) });
      const j = await r.json().catch(() => ({})); if (r.status === 401) { showLogin(); return; } if (!r.ok) throw new Error(j.error || r.status);
      cleaned = { name: "photo-clean.jpg", type: "image/jpeg", data: j.data }; showCompare(data, j.data, "배경 정리", true);
    } catch (err) { msg($("#formMsg"), "배경 정리 실패: " + err.message, "err"); }
    btn.disabled = false; btn.textContent = "배경 정리";
  }
  async function toneClean() {
    const btn = $("#toneBtn"); btn.disabled = true; btn.textContent = "정리 중…"; msg($("#formMsg"), "");
    try {
      const data = await currentImageBase64(); if (!data) throw new Error("사진이 없습니다.");
      const out = await frameBase64(await toneCleanBase64(data));
      cleaned = { name: "photo-frame.jpg", type: "image/jpeg", data: out }; showCompare(data, out, "스튜디오 액자", false);
    } catch (err) { msg($("#formMsg"), "액자 정리 실패: " + err.message, "err"); }
    btn.disabled = false; btn.textContent = "스튜디오 액자";
  }
  function autoClean() { ($("#category").value === "thing" ? cleanBackground : toneClean)(); }

  /* ── 링크에서 사진 ── */
  async function linkPhotos() {
    const f = $("#itemForm"), url = f.importUrl.value.trim(), box = $("#linkPhotos"), btn = $("#linkPhotosBtn");
    if (!url) return msg($("#formMsg"), "먼저 링크를 넣어 주세요.", "err");
    btn.disabled = true; btn.textContent = "가져오는 중…"; box.hidden = false; box.innerHTML = `<span class="help note">사진을 찾는 중…</span>`;
    try {
      const j = await api("/api/linkphotos", { method: "POST", body: JSON.stringify({ url }) });
      if (!f.name.value.trim() && j.name) f.name.value = j.name;
      box.innerHTML = j.photos.map(p => `<div class="ph" data-src="${esc(p.src)}"><img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`).join("")
        + `<span class="help note">${j.photos.length ? `${esc(j.name || "")} · 사진을 누르면 선택한 칸에 넣고 바로 정리본을 보여줍니다. (최대 ${MAX_PHOTOS}장)` : esc(j.note || "이 링크에서는 사진을 찾지 못했습니다.")}</span>`;
    } catch (err) { box.innerHTML = `<span class="help note">${esc(err.message)}</span>`; }
    btn.disabled = false; btn.textContent = "링크에서 사진";
  }
  async function useLinkPhoto(src) {
    if (slots.every(Boolean) && slots[sel]) { if (!confirm("세 칸이 모두 찼습니다. 선택한 칸의 사진을 바꿀까요?")) return; }
    msg($("#formMsg"), "사진 가져오는 중…");
    try { const j = await api("/api/fetchimage", { method: "POST", body: JSON.stringify({ src }) }); msg($("#formMsg"), ""); putPhoto({ name: "link-photo.jpg", type: "image/jpeg", data: j.data }); }
    catch (err) { msg($("#formMsg"), "사진 가져오기 실패: " + err.message, "err"); }
  }

  /* ── 북마클릿: 보고 있는 페이지의 사진 목록을 이 어드민으로 보냅니다 (서버가 못 여는 사이트용) ── */
  const BOOKMARKLET = "javascript:" + encodeURIComponent("(function(){var A='__ORIGIN__';var c=function(u){return String(u||'').replace(/\\?.*$/,'')};var L=[];var og=document.querySelector('meta[property=\"og:image\"]');if(og&&og.content)L.push(c(og.content));[].slice.call(document.images).sort(function(a,b){return (b.naturalWidth*b.naturalHeight)-(a.naturalWidth*a.naturalHeight)}).forEach(function(i){var u=i.currentSrc||i.src;if(u&&/^https?:/.test(u)&&(i.naturalWidth>=300||/phinf|pstatic/.test(u)))L.push(c(u))});var s=document.documentElement.outerHTML.replace(/\\\\u002F/g,'/');(s.match(/https?:\\/\\/[a-z0-9.-]*phinf\\.pstatic\\.net\\/[^\"'\\\\\\s<>)]+?\\.(?:jpe?g|png|webp)/gi)||[]).forEach(function(u){L.push(c(u))});var U=[];L.forEach(function(x){if(x&&U.indexOf(x)<0)U.push(x)});var t=(document.querySelector('meta[property=\"og:title\"]')||{}).content||document.title;window.open(A+'/admin#import='+encodeURIComponent(JSON.stringify({name:t,url:location.href,photos:U.slice(0,24)})),'_blank')})();".replace("__ORIGIN__", location.origin));
  $("#bookmarklet").href = BOOKMARKLET;
  $("#bookmarklet").addEventListener("click", e => { e.preventDefault(); alert("이 버튼은 누르는 게 아니라 북마크바로 끌어다 놓는 것입니다. 그 뒤 상품 페이지에서 북마크를 누르세요."); });
  $("#bmCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(BOOKMARKLET); msg($("#formMsg"), "북마크 코드를 복사했습니다. 북마크의 주소 칸에 붙여넣으세요.", "ok"); } catch (_) { prompt("아래 코드를 복사하세요", BOOKMARKLET); } });
  function receiveImport() {
    const m = location.hash.match(/^#import=(.+)$/); if (!m) return false;
    let payload = null; try { payload = JSON.parse(decodeURIComponent(m[1])); } catch (_) {}
    history.replaceState(null, "", location.pathname); if (!payload) return false;
    if ($("#itemForm").hidden) openItem(null);
    const f = $("#itemForm"); if (payload.url) f.importUrl.value = payload.url; if (!f.name.value.trim() && payload.name) f.name.value = String(payload.name).replace(/\s*[:|]\s*[^:|]*$/, "").slice(0, 60);
    const photos = (payload.photos || []).filter(u => /^https?:\/\//.test(u)).slice(0, 24);
    const box = $("#linkPhotos"); box.hidden = false;
    box.innerHTML = photos.map(src => `<div class="ph" data-src="${esc(src)}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`).join("")
      + `<span class="help note">${photos.length ? "북마크로 받은 사진 " + photos.length + "장 · 누르면 선택한 칸에 넣고 바로 정리본을 보여줍니다." : "받은 사진이 없습니다."}</span>`;
    msg($("#formMsg"), photos.length ? "페이지에서 사진을 받았습니다. 아래에서 고르세요." : "", photos.length ? "ok" : "");
    return true;
  }

  /* ── 글 폼 ── */
  function openItem(id) {
    const f = $("#itemForm"); f.reset(); editingId = id; editingSceneId = null; editingCatId = null; cleaned = null; sel = 0;
    const it = id ? state.items.find(i => i.id === id) : null;
    $("#formTitle").textContent = it ? "글 수정" : "새 글"; $("#formId").textContent = it ? it.id : ""; setFormState(it ? !!it.draft : null); formDirty = false;
    $("#category").innerHTML = state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("");
    $("#sceneChecks").innerHTML = state.scenes.map(sc => `<label><input type="checkbox" name="scene" value="${esc(sc.id)}" ${it && sc.items.includes(it.id) ? "checked" : ""}> ${esc(sc.title)}</label>`).join("") || `<span class="help">장면이 없습니다. 왼쪽에서 먼저 만들 수 있어요.</span>`;
    const imgs = it ? (it.images && it.images.length ? it.images : (it.image ? [it.image] : [])) : [];
    slots = Array.from({ length: MAX_PHOTOS }, (_, i) => imgs[i] ? { url: imgs[i], pending: null } : null);
    if (it) {
      f.category.value = it.category; f.name.value = it.name || ""; f.oneLine.value = it.oneLine || ""; f.price.value = it.price || ""; f.info.value = it.info || "";
      f.opinion.value = it.opinion || ""; f.forWhom.value = it.forWhom || ""; f.link.value = it.link || ""; f.importUrl.value = it.sourceUrl || ""; f.tags.value = (it.tags || []).join(", "); setRating(it.rating || 0);
    } else setRating(0);
    $("#compare").hidden = true; $("#linkPhotos").hidden = true; $("#linkPhotos").innerHTML = ""; $("#imageFile").value = "";
    renderSlots(); $("#deleteBtn").hidden = !it; msg($("#formMsg"), ""); showPanel("item"); renderList(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  let formDirty = false;
  function buildItem(id, images, draft) {
    const f = $("#itemForm");
    return {
      id, category: f.category.value, name: f.name.value.trim(), oneLine: f.oneLine.value.trim(), image: images[0] || "", images,
      price: f.price.value.trim(), info: f.info.value.trim(), rating: Number($("#rating").value) || 0,
      opinion: f.opinion.value.trim(), forWhom: f.forWhom.value.trim(), link: f.link.value.trim(), sourceUrl: f.importUrl.value.trim(),
      tags: f.tags.value.split(",").map(s => s.trim()).filter(Boolean), draft,
    };
  }
  /* 미리보기: 저장하지 않은 현재 내용을 사이트 상세 페이지 모양 그대로 새 탭에서 봅니다 (이 브라우저 안에서만). */
  function preview() {
    const images = slots.filter(Boolean).map(slotSrc);
    const item = buildItem(editingId || "preview", images, true);
    if (!item.name) item.name = "(이름 없음)";
    try { localStorage.setItem("hoj_preview", JSON.stringify({ item, categories: state.categories, at: Date.now() })); }
    catch (e) { return msg($("#formMsg"), "미리보기 데이터가 너무 큽니다. 사진을 줄여 보세요.", "err"); }
    window.open("/item?preview=1", "hoj_preview");
  }
  function setFormState(draft) { const el = $("#formState"); el.hidden = draft === null; el.textContent = draft ? "임시저장 · 사이트에 안 보임" : "게시됨"; el.style.background = draft ? "#f3e9c8" : "#e3efe6"; el.style.color = draft ? "#6b5a1e" : "#2f5a3a"; }
  async function submitItem(e, asDraft = false) {
    if (e) e.preventDefault();
    const f = $("#itemForm"), btn = $("#saveBtn"), dbtn = $("#draftBtn"); btn.disabled = dbtn.disabled = true; msg($("#formMsg"), "저장 중…");
    if (!f.name.value.trim()) { msg($("#formMsg"), "이름은 적어 주세요.", "err"); btn.disabled = dbtn.disabled = false; return; }
    /* 안전장치: 이미 있는 글을 열어 둔 채 전혀 다른 글을 쓰면 기존 글이 덮어써집니다. 이름이 크게 바뀌면 한 번 묻습니다. */
    const existing = editingId ? state.items.find(i => i.id === editingId) : null;
    if (existing && existing.name && f.name.value.trim() !== existing.name) {
      const same = (x, y) => { x = x.replace(/\s+/g, ""); y = y.replace(/\s+/g, ""); return x.includes(y.slice(0, 4)) || y.includes(x.slice(0, 4)); };
      if (!same(existing.name, f.name.value.trim())) {
        const ok = confirm(`지금 열려 있는 글은 "${existing.name}" 입니다.\n이 글의 내용을 "${f.name.value.trim()}" 으로 바꿔 덮어쓰려는 게 맞나요?\n\n[확인] 덮어쓰기   [취소] 새 글로 따로 저장`);
        if (!ok) { editingId = null; $("#formId").textContent = ""; $("#formTitle").textContent = "새 글"; setFormState(null); $("#deleteBtn").hidden = true; msg($("#formMsg"), "새 글로 저장합니다. 기존 글은 그대로 둡니다."); }
      }
    }
    try {
      const id = editingId || slug("item");
      const images = [];
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]; if (!s) continue;
        if (s.pending) { msg($("#formMsg"), `사진 ${images.length + 1} 올리는 중…`); s.url = (await api("/api/upload", { method: "POST", body: JSON.stringify(s.pending) })).url; s.pending = null; }
        images.push(s.url);
      }
      const item = buildItem(id, images, !!asDraft);
      const chosen = [...f.querySelectorAll('input[name="scene"]:checked')].map(c => c.value);
      await commit(d => {
        const idx = d.items.findIndex(i => i.id === id); const prev = idx >= 0 ? d.items[idx] : null;
        item.createdAt = (prev && prev.createdAt) || new Date().toISOString();
        item.publishedAt = (prev && prev.publishedAt) || (!item.draft ? new Date().toISOString() : undefined);   // 최초 게시 시각은 한 번 정해지면 바뀌지 않음
        if (!item.publishedAt) delete item.publishedAt;
        if (idx >= 0) d.items[idx] = item; else d.items.unshift(item);
        d.scenes.forEach(sc => { const had = sc.items.includes(id); if (chosen.includes(sc.id) && !had) sc.items.push(id); if (!chosen.includes(sc.id) && had) sc.items = sc.items.filter(x => x !== id); });
      });
      editingId = id; $("#formId").textContent = id; $("#formTitle").textContent = "글 수정"; $("#deleteBtn").hidden = false; renderSlots(); setFormState(!!asDraft); formDirty = false;
      renderList(); msg($("#formMsg"), asDraft ? "임시저장했습니다. 사이트에는 보이지 않습니다. 공개하려면 \"게시\"를 누르세요." : "게시했습니다. 사이트에 바로 반영됩니다.", "ok");
    } catch (err) { msg($("#formMsg"), "저장 실패: " + err.message, "err"); }
    btn.disabled = dbtn.disabled = false;
  }
  async function deleteItem() {
    const it = state.items.find(i => i.id === editingId); if (!it || !confirm(`"${it.name}" 글을 삭제할까요?`)) return;
    msg($("#formMsg"), "삭제 중…");
    try { await commit(d => { d.items = d.items.filter(i => i.id !== it.id); d.scenes.forEach(sc => sc.items = sc.items.filter(x => x !== it.id)); }); editingId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#formMsg"), "삭제 실패: " + err.message, "err"); }
  }

  /* ── 장면 ── */
  function openScene(id) {
    const f = $("#sceneForm"); f.reset(); editingSceneId = id; editingId = null; editingCatId = null;
    const sc = id ? state.scenes.find(s => s.id === id) : null;
    $("#sceneFormTitle").textContent = sc ? "장면 수정" : "새 장면"; $("#sceneFormId").textContent = sc ? sc.id : "";
    if (sc) { f.title.value = sc.title; f.body.value = sc.body || ""; }
    renderScenePicks(sc ? sc.items : []);
    $("#sceneDeleteBtn").hidden = !sc; msg($("#sceneMsg"), ""); showPanel("scene"); renderList();
  }
  let scenePickOrder = [];   // 체크한 순서를 기억해 그 순서대로 저장
  function renderScenePicks(chosen) {
    scenePickOrder = chosen.filter(id => state.items.some(i => i.id === id));
    const box = $("#sceneItems");
    box.innerHTML = state.items.length ? state.items.map(it => `
      <label><input type="checkbox" name="sceneItem" value="${esc(it.id)}" ${scenePickOrder.includes(it.id) ? "checked" : ""}>
        <span class="th">${firstImage(it) ? `<img src="${esc(firstImage(it))}" alt="">` : ""}</span>
        <span><b>${esc(it.name)}</b><small>${esc(catLabel(it.category))}${it.price ? " · " + esc(it.price) : ""}</small></span>
        <span class="order"></span></label>`).join("") : `<span class="help empty">아직 글이 없습니다. 글을 먼저 쓰고 장면에 넣을 수 있어요.</span>`;
    updateSceneOrder();
  }
  function updateSceneOrder() {
    $("#sceneItems").querySelectorAll("label").forEach(l => { const id = l.querySelector("input").value, k = scenePickOrder.indexOf(id); l.querySelector(".order").textContent = k >= 0 ? k + 1 : ""; });
    $("#sceneItemsCount").textContent = scenePickOrder.length ? `${scenePickOrder.length}개 선택` : "";
  }
  $("#sceneItems").addEventListener("change", e => {
    const cb = e.target; if (cb.name !== "sceneItem") return;
    scenePickOrder = cb.checked ? [...scenePickOrder.filter(x => x !== cb.value), cb.value] : scenePickOrder.filter(x => x !== cb.value);
    updateSceneOrder();
  });
  async function submitScene(e) {
    e.preventDefault(); const f = $("#sceneForm"); msg($("#sceneMsg"), "저장 중…");
    try {
      const id = editingSceneId || slug("scene");
      const sc = { id, title: f.title.value.trim(), body: f.body.value.trim(), items: scenePickOrder.slice() };
      await commit(d => { const idx = d.scenes.findIndex(s => s.id === id); if (idx >= 0) d.scenes[idx] = sc; else d.scenes.push(sc); }); editingSceneId = id; $("#sceneFormId").textContent = id; $("#sceneFormTitle").textContent = "장면 수정"; $("#sceneDeleteBtn").hidden = false;
      renderList(); msg($("#sceneMsg"), "저장했습니다.", "ok");
    } catch (err) { msg($("#sceneMsg"), "저장 실패: " + err.message, "err"); }
  }
  async function deleteScene() {
    const sc = state.scenes.find(s => s.id === editingSceneId); if (!sc || !confirm(`"${sc.title}" 장면을 삭제할까요? (글은 남습니다)`)) return;
    try { await commit(d => { d.scenes = d.scenes.filter(s => s.id !== sc.id); }); editingSceneId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#sceneMsg"), "삭제 실패: " + err.message, "err"); }
  }

  /* ── 사이트 설정 (첫 화면 문구·소개·기준·연락처) ── */
  const SITE_DEFAULTS = window.SITE || {};   // data/site.js 의 기본값
  let crit = [];
  function siteNow() { const s = state.site || {}; return { ...SITE_DEFAULTS, ...s, contact: { ...(SITE_DEFAULTS.contact || {}), ...(s.contact || {}) } }; }
  function openSite() {
    editingId = editingSceneId = editingCatId = null; const f = $("#siteForm"), s = siteNow();
    f.name.value = s.name || ""; f.nameEn.value = s.nameEn || ""; f.tagline.value = s.tagline || ""; f.intro.value = s.intro || "";
    f.aboutTitle.value = s.aboutTitle || ""; f.owner.value = s.owner || ""; f.aboutBody.value = s.aboutBody || "";
    f.instagram.value = (s.contact || {}).instagram || ""; f.kakao.value = (s.contact || {}).kakao || ""; f.email.value = (s.contact || {}).email || ""; f.footerNote.value = s.footerNote || "";
    crit = (s.criteria || []).map(c => ({ title: c.title || "", body: c.body || "" })); renderCrit();
    msg($("#siteMsg"), ""); showPanel("site"); renderList(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderCrit() {
    $("#critCount").textContent = crit.length ? `${crit.length}개` : "";
    $("#critList").innerHTML = crit.map((c, i) => `
      <div class="crit" data-i="${i}">
        <input type="text" data-k="title" value="${esc(c.title)}" placeholder="제목 (예: 직접 겪은 것만)">
        <span class="tools"><button type="button" data-act="up" title="위로" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-act="down" title="아래로" ${i === crit.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-act="del" title="삭제">×</button></span>
        <textarea rows="2" data-k="body" placeholder="설명">${esc(c.body)}</textarea>
      </div>`).join("") || `<span class="help">기준이 없습니다. "+ 기준 추가"를 누르세요.</span>`;
  }
  $("#critList").addEventListener("input", e => { const el = e.target.closest("[data-k]"); if (!el) return; crit[Number(el.closest(".crit").dataset.i)][el.dataset.k] = el.value; });
  $("#critList").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if (!b) return; const i = Number(b.closest(".crit").dataset.i);
    if (b.dataset.act === "del") crit.splice(i, 1); else { const j = i + (b.dataset.act === "up" ? -1 : 1); if (j < 0 || j >= crit.length) return; [crit[i], crit[j]] = [crit[j], crit[i]]; }
    renderCrit();
  });
  $("#critAdd").addEventListener("click", () => { crit.push({ title: "", body: "" }); renderCrit(); const last = $("#critList .crit:last-child input"); if (last) last.focus(); });
  $("#siteForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = $("#siteForm"); msg($("#siteMsg"), "저장 중…");
    const site = {
      name: f.name.value.trim(), nameEn: f.nameEn.value.trim(), tagline: f.tagline.value.trim(), intro: f.intro.value.trim(),
      aboutTitle: f.aboutTitle.value.trim(), owner: f.owner.value.trim(), aboutBody: f.aboutBody.value.trim(),
      criteria: crit.map(c => ({ title: c.title.trim(), body: c.body.trim() })).filter(c => c.title || c.body),
      contact: { instagram: f.instagram.value.trim(), kakao: f.kakao.value.trim(), email: f.email.value.trim() }, footerNote: f.footerNote.value.trim(),
    };
    try { await commit(d => { d.site = site; }); msg($("#siteMsg"), "저장했습니다. 사이트에 바로 반영됩니다.", "ok"); }
    catch (err) { msg($("#siteMsg"), "저장 실패: " + err.message, "err"); }
  });
  $("#siteCancelBtn").addEventListener("click", () => { renderList(); showPanel("empty"); });
  $("#siteBtn").addEventListener("click", e => { e.preventDefault(); openSite(); });

  /* ── 순서 바꾸기 ── */
  let orderIds = [];
  function openOrder() {
    editingId = editingSceneId = editingCatId = null;
    orderIds = displayOrder(state.items.filter(i => !i.draft), state.manualOrder).map(i => i.id);
    renderOrder(); msg($("#orderMsg"), ""); showPanel("order"); renderList();
  }
  function renderOrder() {
    $("#orderMode").textContent = Array.isArray(state.manualOrder) && state.manualOrder.length ? "지금: 손으로 정한 순서" : "지금: 최초 게시일 순";
    $("#orderList").innerHTML = orderIds.map((id, k) => { const it = state.items.find(i => i.id === id); return `
      <li data-id="${esc(id)}"><span class="num">${k + 1}</span><span class="th">${firstImage(it) ? `<img src="${esc(firstImage(it))}" alt="">` : ""}</span>
        <span><b>${esc(it.name)}</b><small>${esc(catLabel(it.category))}${it.publishedAt ? " · 게시 " + fmtDate(it.publishedAt) : ""}</small></span>
        <span class="mv"><button type="button" data-mv="-1" ${k === 0 ? "disabled" : ""} title="위로">↑</button><button type="button" data-mv="1" ${k === orderIds.length - 1 ? "disabled" : ""} title="아래로">↓</button></span></li>`; }).join("")
      || `<li class="help" style="display:block">게시된 글이 없습니다.</li>`;
  }
  $("#orderList").addEventListener("click", e => {
    const b = e.target.closest("button[data-mv]"); if (!b) return;
    const id = b.closest("li").dataset.id, k = orderIds.indexOf(id), j = k + Number(b.dataset.mv);
    if (j < 0 || j >= orderIds.length) return; [orderIds[k], orderIds[j]] = [orderIds[j], orderIds[k]]; renderOrder();
  });
  $("#orderForm").addEventListener("submit", async e => {
    e.preventDefault(); msg($("#orderMsg"), "저장 중…");
    try { await commit(d => { d.manualOrder = orderIds.slice(); }); renderOrder(); renderList(); msg($("#orderMsg"), "저장했습니다. 사이트에 바로 반영됩니다.", "ok"); }
    catch (err) { msg($("#orderMsg"), "저장 실패: " + err.message, "err"); }
  });
  $("#orderResetBtn").addEventListener("click", async () => {
    if (!confirm("손으로 정한 순서를 지우고 최초 게시일 순으로 되돌릴까요?")) return; msg($("#orderMsg"), "저장 중…");
    try { await commit(d => { d.manualOrder = null; }); openOrder(); msg($("#orderMsg"), "게시일 순으로 되돌렸습니다.", "ok"); }
    catch (err) { msg($("#orderMsg"), "실패: " + err.message, "err"); }
  });
  $("#orderCancelBtn").addEventListener("click", () => { renderList(); showPanel("empty"); });
  $("#orderBtn").addEventListener("click", openOrder);

  /* ── 갈래 ── */
  function openCat(id) {
    const f = $("#catForm"); f.reset(); editingCatId = id; editingId = null; editingSceneId = null;
    const c = id ? state.categories.find(x => x.id === id) : null;
    $("#catFormTitle").textContent = c ? "갈래 수정" : "새 갈래"; $("#catFormId").textContent = c ? c.id : "";
    if (c) f.label.value = c.label;
    $("#catDeleteBtn").hidden = !c; msg($("#catMsg"), ""); showPanel("cat"); renderList();
  }
  async function submitCat(e) {
    e.preventDefault(); const f = $("#catForm"); msg($("#catMsg"), "저장 중…");
    try {
      const label = f.label.value.trim();
      if (state.categories.some(c => c.label === label && c.id !== editingCatId)) throw new Error("같은 이름의 갈래가 이미 있습니다.");
      const id = editingCatId || slug("cat");
      await commit(d => { const idx = d.categories.findIndex(c => c.id === id); if (idx >= 0) d.categories[idx] = { ...d.categories[idx], label }; else d.categories.push({ id, label }); }); editingCatId = id; $("#catFormId").textContent = id; $("#catFormTitle").textContent = "갈래 수정"; $("#catDeleteBtn").hidden = false;
      renderList(); msg($("#catMsg"), "저장했습니다.", "ok");
    } catch (err) { msg($("#catMsg"), "저장 실패: " + err.message, "err"); }
  }
  async function deleteCat() {
    const c = state.categories.find(x => x.id === editingCatId); if (!c) return;
    const used = state.items.filter(i => i.category === c.id).length;
    if (used) return msg($("#catMsg"), `이 갈래에 글이 ${used}개 있어 삭제할 수 없습니다. 글의 갈래를 먼저 바꿔 주세요.`, "err");
    if (!confirm(`"${c.label}" 갈래를 삭제할까요?`)) return;
    try { await commit(d => { d.categories = d.categories.filter(x => x.id !== c.id); }); editingCatId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#catMsg"), "삭제 실패: " + err.message, "err"); }
  }

  /* ── 개인 메모 (어드민 전용, 암호화 저장) ── */
  const memo = { loaded: false, dirty: false, timer: null, saving: false, last: "" };
  const memoSaved = t => { $("#memoSaved").textContent = t; };
  async function memoLoad() {
    try { const j = await api("/api/notes"); $("#memoText").value = j.text || ""; memo.last = j.text || ""; memo.loaded = true; memoSaved(j.updatedAt ? "마지막 저장 " + new Date(j.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""); }
    catch (err) { memoSaved("불러오기 실패: " + err.message); }
  }
  async function memoSave() {
    if (!memo.loaded || memo.saving) return; const text = $("#memoText").value; if (text === memo.last) { memo.dirty = false; return; }
    memo.saving = true; memoSaved("저장 중…");
    try { await api("/api/notes", { method: "PUT", body: JSON.stringify({ text }) }); memo.last = text; memo.dirty = false; memoSaved("저장됨 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })); }
    catch (err) { memoSaved("저장 실패: " + err.message); }
    memo.saving = false; if ($("#memoText").value !== memo.last) memoSchedule();
  }
  function memoSchedule() { memo.dirty = true; memoSaved("입력 중…"); clearTimeout(memo.timer); memo.timer = setTimeout(memoSave, 1200); }
  function memoOpen(open) { const el = $("#memo"); el.hidden = !open; try { localStorage.setItem("hoj_memo_open", open ? "1" : "0"); } catch (_) {} if (open) { el.classList.remove("min"); if (!memo.loaded) memoLoad(); setTimeout(() => $("#memoText").focus(), 50); } }
  $("#memoFab").addEventListener("click", () => memoOpen($("#memo").hidden));
  $("#memoClose").addEventListener("click", () => { memoSave(); memoOpen(false); });
  $("#memoMin").addEventListener("click", () => $("#memo").classList.toggle("min"));
  $("#memoText").addEventListener("input", memoSchedule);
  $("#memoText").addEventListener("blur", () => { clearTimeout(memo.timer); memoSave(); });
  window.addEventListener("beforeunload", e => { if (memo.dirty) memoSave(); if (memo.dirty || (formDirty && !$("#itemForm").hidden)) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#memo").hidden) memoOpen(false); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "m" && !$("#app").hidden) { e.preventDefault(); memoOpen($("#memo").hidden); } });
  (function drag() {   // 머리글을 잡고 끌기, 오른쪽 아래로 크기 조절
    const el = $("#memo"), head = $("#memoHead"), rs = $("#memoResize"); let st = null;
    const pos = () => { const r = el.getBoundingClientRect(); el.style.left = r.left + "px"; el.style.top = r.top + "px"; el.style.right = "auto"; el.style.bottom = "auto"; };
    head.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; pos(); st = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop }; head.setPointerCapture(e.pointerId); });
    head.addEventListener("pointermove", e => { if (!st) return; el.style.left = Math.max(0, Math.min(window.innerWidth - 80, st.l + e.clientX - st.x)) + "px"; el.style.top = Math.max(0, Math.min(window.innerHeight - 40, st.t + e.clientY - st.y)) + "px"; });
    head.addEventListener("pointerup", () => { st = null; });
    let rz = null;
    rs.addEventListener("pointerdown", e => { pos(); rz = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight }; rs.setPointerCapture(e.pointerId); e.preventDefault(); });
    rs.addEventListener("pointermove", e => { if (!rz) return; el.style.width = Math.max(260, rz.w + e.clientX - rz.x) + "px"; el.style.height = Math.max(160, rz.h + e.clientY - rz.y) + "px"; });
    rs.addEventListener("pointerup", () => { rz = null; });
  })();

  /* ── 시작/이벤트 ── */
  async function enter() {
    $("#login").hidden = true; $("#app").hidden = false; $("#logout").hidden = false; $("#memoFab").hidden = false; $("#siteBtn").hidden = false;
    await loadData(); renderList(); showPanel("empty");
    let open = "0"; try { open = localStorage.getItem("hoj_memo_open") || "0"; } catch (_) {} if (open === "1") memoOpen(true);
    receiveImport();
  }
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault(); const btn = $("#loginBtn"); btn.disabled = true; msg($("#loginMsg"), "");
    try { await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) }); $("#password").value = ""; await enter(); }
    catch (err) { msg($("#loginMsg"), err.message, "err"); }
    btn.disabled = false;
  });
  $("#logout").addEventListener("click", async e => { e.preventDefault(); await api("/api/logout", { method: "POST" }).catch(() => {}); location.reload(); });
  $("#newBtn").addEventListener("click", () => openItem(null));
  $("#newSceneBtn").addEventListener("click", () => openScene(null));
  $("#newCatBtn").addEventListener("click", () => openCat(null));
  $("#list").addEventListener("click", e => { const li = e.target.closest("li[data-id]"); if (li) openItem(li.dataset.id); });
  $("#sceneList").addEventListener("click", e => { const li = e.target.closest("li[data-scene]"); if (li) openScene(li.dataset.scene); });
  $("#catList").addEventListener("click", e => { const li = e.target.closest("li[data-cat]"); if (li) openCat(li.dataset.cat); });
  $("#itemForm").addEventListener("submit", e => submitItem(e, false));
  $("#draftBtn").addEventListener("click", () => submitItem(null, true));
  $("#previewBtn").addEventListener("click", preview);
  $("#itemForm").addEventListener("input", () => { formDirty = true; });
  $("#cancelBtn").addEventListener("click", e => { if (formDirty && !confirm("저장하지 않은 내용이 있습니다. 그래도 닫을까요?")) { e.stopImmediatePropagation(); } }, true);
  $("#cancelBtn").addEventListener("click", () => { editingId = null; renderList(); showPanel("empty"); });
  $("#deleteBtn").addEventListener("click", deleteItem);
  $("#sceneForm").addEventListener("submit", submitScene);
  $("#sceneCancelBtn").addEventListener("click", () => { editingSceneId = null; renderList(); showPanel("empty"); });
  $("#sceneDeleteBtn").addEventListener("click", deleteScene);
  $("#catForm").addEventListener("submit", submitCat);
  $("#catCancelBtn").addEventListener("click", () => { editingCatId = null; renderList(); showPanel("empty"); });
  $("#catDeleteBtn").addEventListener("click", deleteCat);
  $("#heartpick").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    const rect = b.getBoundingClientRect(), half = (e.clientX - rect.left) < rect.width / 2;   // 왼쪽 절반 = 반 하트
    const v = Number(b.dataset.v) - (half ? 0.5 : 0);
    setRating(v === Number($("#rating").value) ? 0 : v);
  });
  $("#slots").addEventListener("click", e => { const b = e.target.closest(".slot"); if (!b) return; selectSlot(Number(b.dataset.i)); if (!slots[sel]) $("#imageFile").click(); });
  $("#imageFile").addEventListener("change", async e => { const file = e.target.files[0]; if (!file) return; try { putPhoto(await fileToJpeg(file)); } catch (err) { msg($("#formMsg"), err.message, "err"); } e.target.value = ""; });
  $("#imgClear").addEventListener("click", () => { slots[sel] = null; slots = [...slots.filter(Boolean), ...Array(MAX_PHOTOS).fill(null)].slice(0, MAX_PHOTOS); sel = Math.min(sel, Math.max(0, slots.filter(Boolean).length - 1)); $("#compare").hidden = true; renderSlots(); });
  $("#cleanBtn").addEventListener("click", cleanBackground);
  $("#toneBtn").addEventListener("click", toneClean);
  $("#presets").addEventListener("click", e => { const b = e.target.closest("button[data-preset]"); if (!b) return; preset = b.dataset.preset; $("#presets").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); cleanBackground(); });
  $("#cmpUse").addEventListener("click", () => { if (!cleaned || !slots[sel]) return; slots[sel] = { url: "", pending: cleaned }; $("#compare").hidden = true; renderSlots(); msg($("#formMsg"), "정리한 사진으로 바꿨습니다. 저장을 누르면 반영됩니다.", "ok"); });
  $("#cmpKeep").addEventListener("click", () => { cleaned = null; $("#compare").hidden = true; });
  $("#linkPhotosBtn").addEventListener("click", linkPhotos);
  $("#linkPhotos").addEventListener("click", e => { const ph = e.target.closest(".ph"); if (ph) useLinkPhoto(ph.dataset.src); });

  fetch("/api/me", { credentials: "same-origin", cache: "no-store" }).then(r => r.json()).then(j => j.ok ? enter() : showLogin()).catch(showLogin);
})();
