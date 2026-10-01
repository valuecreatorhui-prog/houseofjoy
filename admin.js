/* 관리자: GitHub Contents API로 data/items.js 와 img/ 를 직접 읽고 씁니다. */
(function () {
  const OWNER = "valuecreatorhui-prog", REPO = "houseofjoy", BRANCH = "main", DATA_PATH = "data/items.js";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const hearts = n => { const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return r ? `<span class="hearts">${"♥".repeat(r)}<i>${"♥".repeat(5 - r)}</i></span>` : ""; };

  let token = "", state = null; // state: { categories, scenes, items, sha }
  let editingId = null, editingSceneId = null, pendingImage = null; // pendingImage: { base64, ext }

  /* ── GitHub ── */
  const b64encode = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), c => c.charCodeAt(0)));
  async function gh(path, opts = {}) {
    const r = await fetch(API + path + (opts.method ? "" : `?ref=${BRANCH}&t=${Date.now()}`), {
      ...opts, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
    });
    if (r.status === 404 && !opts.method) return null;
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`${r.status} ${e.message || ""}`); }
    return r.json();
  }
  async function putFile(path, base64, message, sha) {
    return gh(path, { method: "PUT", body: JSON.stringify({ message, content: base64, branch: BRANCH, ...(sha ? { sha } : {}) }) });
  }

  async function loadData() {
    const f = await gh(DATA_PATH);
    if (!f) throw new Error("data/items.js 를 찾을 수 없습니다.");
    const src = b64decode(f.content);
    const w = {}; new Function("window", src)(w);
    state = { categories: w.CATEGORIES || [], scenes: w.SCENES || [], items: w.ITEMS || [], sha: f.sha };
  }
  function serialize() {
    const j = v => JSON.stringify(v, null, 2);
    return `// ─────────────────────────────────────────────
// 셀렉션 데이터 — 관리자 페이지(admin.html)에서 저장하면 이 파일이 다시 쓰입니다.
// 직접 고쳐도 되지만, 형식(JSON)을 지켜 주세요.
//  - CATEGORIES: 물건 / 음식 / 장소
//  - SCENES: "하루의 한 장면"으로 아이템을 묶는 단위
//  - ITEMS: 소개할 하나하나 (rating: 하트 1~5, opinion: 내 의견, forWhom: 이런 분께 권해요)
// ─────────────────────────────────────────────

window.CATEGORIES = ${j(state.categories)};

window.SCENES = ${j(state.scenes)};

window.ITEMS = ${j(state.items)};
`;
  }
  async function saveData(message) {
    const res = await putFile(DATA_PATH, b64encode(serialize()), message, state.sha);
    state.sha = res.content.sha;
  }

  /* ── 이미지: 긴 변 1600px, JPEG 0.85 ── */
  function fileToJpegBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
      img.src = url;
    });
  }

  /* ── UI 공통 ── */
  const msg = (el, text, cls = "") => { el.textContent = text; el.className = "msg " + cls; };
  const slug = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `item-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  const catLabel = id => (state.categories.find(c => c.id === id) || {}).label || id;

  function renderList() {
    $("#count").textContent = state.items.length;
    $("#list").innerHTML = state.items.map(it => `
      <li data-id="${esc(it.id)}" class="${it.id === editingId ? "active" : ""}">
        <div class="th">${it.image ? `<img src="${esc(it.image)}?t=${Date.now()}" alt="">` : ""}</div>
        <div><b>${esc(it.name)}</b><small>${esc(catLabel(it.category))} · ${esc(it.price || "")}</small></div>
        ${hearts(it.rating)}
      </li>`).join("") || `<li class="help" style="cursor:default">아직 항목이 없습니다.</li>`;
    $("#sceneList").innerHTML = state.scenes.map(sc => `
      <li data-scene="${esc(sc.id)}" class="${sc.id === editingSceneId ? "active" : ""}">
        <div class="th" style="display:grid;place-items:center;color:var(--ink-3);font-size:11px">${sc.items.length}</div>
        <div><b>${esc(sc.title)}</b><small>${esc(sc.body || "")}</small></div><span></span>
      </li>`).join("") || `<li class="help" style="cursor:default">장면이 없습니다.</li>`;
  }

  function showPanel(which) {
    $("#itemForm").hidden = which !== "item"; $("#sceneForm").hidden = which !== "scene"; $("#empty").hidden = which !== "empty";
  }

  /* ── 항목 폼 ── */
  function setRating(v) {
    $("#rating").value = v;
    $("#heartpick").querySelectorAll("button").forEach(b => b.classList.toggle("on", Number(b.dataset.v) <= v));
    $("#ratingLabel").textContent = v ? `${v} / 5` : "선택 안 함";
  }
  function setPreview(src) {
    const p = $("#imgprev"); p.innerHTML = src ? `<img src="${esc(src)}" alt="">` : "<span>사진 없음</span>"; $("#imgClear").hidden = !src;
  }
  function openItem(id) {
    const f = $("#itemForm"); f.reset(); pendingImage = null; editingId = id; editingSceneId = null;
    const it = id ? state.items.find(i => i.id === id) : null;
    $("#formTitle").textContent = it ? "항목 수정" : "새 항목"; $("#formId").textContent = it ? it.id : "";
    $("#category").innerHTML = state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("");
    $("#sceneChecks").innerHTML = state.scenes.map(sc => `<label><input type="checkbox" name="scene" value="${esc(sc.id)}" ${it && sc.items.includes(it.id) ? "checked" : ""}> ${esc(sc.title)}</label>`).join("") || `<span class="help">장면이 없습니다. 왼쪽에서 먼저 만들 수 있어요.</span>`;
    if (it) {
      f.category.value = it.category; f.name.value = it.name || ""; f.oneLine.value = it.oneLine || ""; f.price.value = it.price || ""; f.info.value = it.info || "";
      f.opinion.value = (it.opinion || "").replace(/\\n/g, "\n"); f.forWhom.value = it.forWhom || ""; f.link.value = it.link || ""; f.tags.value = (it.tags || []).join(", ");
      $("#image").value = it.image || ""; setPreview(it.image ? `${it.image}?t=${Date.now()}` : ""); setRating(it.rating || 0);
    } else { $("#image").value = ""; setPreview(""); setRating(0); }
    $("#deleteBtn").hidden = !it; msg($("#formMsg"), ""); showPanel("item"); renderList();
    f.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitItem(e) {
    e.preventDefault();
    const f = $("#itemForm"), btn = $("#saveBtn"); btn.disabled = true; msg($("#formMsg"), "저장 중…");
    try {
      const id = editingId || slug();
      let image = $("#image").value;
      if (pendingImage) {
        const path = `img/${id}.jpg`; const existing = await gh(path);
        await putFile(path, pendingImage, `사진 업로드: ${f.name.value}`, existing?.sha);
        image = path;
      }
      const item = {
        id, category: f.category.value, name: f.name.value.trim(), oneLine: f.oneLine.value.trim(), image,
        price: f.price.value.trim(), info: f.info.value.trim(), rating: Number($("#rating").value) || 0,
        opinion: f.opinion.value.trim(), forWhom: f.forWhom.value.trim(), link: f.link.value.trim(),
        tags: f.tags.value.split(",").map(s => s.trim()).filter(Boolean),
      };
      const idx = state.items.findIndex(i => i.id === id);
      if (idx >= 0) state.items[idx] = item; else state.items.unshift(item);
      const chosen = [...f.querySelectorAll('input[name="scene"]:checked')].map(c => c.value);
      state.scenes.forEach(sc => { sc.items = sc.items.filter(x => x !== id); if (chosen.includes(sc.id)) sc.items.push(id); });
      await saveData(`${idx >= 0 ? "수정" : "추가"}: ${item.name}`);
      editingId = id; $("#formId").textContent = id; $("#formTitle").textContent = "항목 수정"; $("#deleteBtn").hidden = false; pendingImage = null; $("#image").value = image;
      renderList(); msg($("#formMsg"), "저장했습니다. 사이트에는 1~2분 안에 반영됩니다.", "ok");
    } catch (err) { msg($("#formMsg"), "저장 실패: " + err.message + (err.message.startsWith("409") ? " — 다른 곳에서 먼저 바뀌었습니다. 새로고침 후 다시 시도하세요." : ""), "err"); }
    btn.disabled = false;
  }

  async function deleteItem() {
    const it = state.items.find(i => i.id === editingId); if (!it || !confirm(`"${it.name}" 항목을 삭제할까요?`)) return;
    msg($("#formMsg"), "삭제 중…");
    try {
      state.items = state.items.filter(i => i.id !== it.id); state.scenes.forEach(sc => sc.items = sc.items.filter(x => x !== it.id));
      await saveData(`삭제: ${it.name}`);
      editingId = null; renderList(); showPanel("empty");
    } catch (err) { msg($("#formMsg"), "삭제 실패: " + err.message, "err"); }
  }

  /* ── 장면 폼 ── */
  function openScene(id) {
    const f = $("#sceneForm"); f.reset(); editingSceneId = id; editingId = null;
    const sc = id ? state.scenes.find(s => s.id === id) : null;
    $("#sceneFormTitle").textContent = sc ? "장면 수정" : "새 장면"; $("#sceneFormId").textContent = sc ? sc.id : "";
    if (sc) { f.title.value = sc.title; f.body.value = sc.body || ""; }
    $("#sceneDeleteBtn").hidden = !sc; msg($("#sceneMsg"), ""); showPanel("scene"); renderList();
  }
  async function submitScene(e) {
    e.preventDefault(); const f = $("#sceneForm"); msg($("#sceneMsg"), "저장 중…");
    try {
      const id = editingSceneId || slug().replace("item-", "scene-");
      const idx = state.scenes.findIndex(s => s.id === id);
      const sc = { id, title: f.title.value.trim(), body: f.body.value.trim(), items: idx >= 0 ? state.scenes[idx].items : [] };
      if (idx >= 0) state.scenes[idx] = sc; else state.scenes.push(sc);
      await saveData(`장면 ${idx >= 0 ? "수정" : "추가"}: ${sc.title}`);
      editingSceneId = id; $("#sceneFormId").textContent = id; $("#sceneFormTitle").textContent = "장면 수정"; $("#sceneDeleteBtn").hidden = false;
      renderList(); msg($("#sceneMsg"), "저장했습니다.", "ok");
    } catch (err) { msg($("#sceneMsg"), "저장 실패: " + err.message, "err"); }
  }
  async function deleteScene() {
    const sc = state.scenes.find(s => s.id === editingSceneId); if (!sc || !confirm(`"${sc.title}" 장면을 삭제할까요? (항목은 남습니다)`)) return;
    try { state.scenes = state.scenes.filter(s => s.id !== sc.id); await saveData(`장면 삭제: ${sc.title}`); editingSceneId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#sceneMsg"), "삭제 실패: " + err.message, "err"); }
  }

  /* ── 시작 ── */
  async function start() {
    $("#login").hidden = true; $("#app").hidden = false; $("#logout").hidden = false;
    await loadData(); renderList(); showPanel("empty");
  }
  async function tryLogin(t) {
    token = t.trim();
    try { await start(); localStorage.setItem("hoj_token", token); }
    catch (err) { token = ""; $("#app").hidden = true; $("#login").hidden = false; $("#logout").hidden = true; msg($("#loginMsg"), "연결 실패: " + err.message + " — 토큰 권한(Contents: Read and write, houseofjoy 저장소)을 확인하세요.", "err"); }
  }

  $("#loginForm").addEventListener("submit", e => { e.preventDefault(); tryLogin($("#token").value); });
  $("#logout").addEventListener("click", e => { e.preventDefault(); localStorage.removeItem("hoj_token"); location.reload(); });
  $("#newBtn").addEventListener("click", () => openItem(null));
  $("#newSceneBtn").addEventListener("click", () => openScene(null));
  $("#list").addEventListener("click", e => { const li = e.target.closest("li[data-id]"); if (li) openItem(li.dataset.id); });
  $("#sceneList").addEventListener("click", e => { const li = e.target.closest("li[data-scene]"); if (li) openScene(li.dataset.scene); });
  $("#itemForm").addEventListener("submit", submitItem);
  $("#cancelBtn").addEventListener("click", () => { editingId = null; renderList(); showPanel("empty"); });
  $("#deleteBtn").addEventListener("click", deleteItem);
  $("#sceneForm").addEventListener("submit", submitScene);
  $("#sceneCancelBtn").addEventListener("click", () => { editingSceneId = null; renderList(); showPanel("empty"); });
  $("#sceneDeleteBtn").addEventListener("click", deleteScene);
  $("#heartpick").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; const v = Number(b.dataset.v); setRating(v === Number($("#rating").value) ? 0 : v); });
  $("#imageFile").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try { pendingImage = await fileToJpegBase64(file); setPreview("data:image/jpeg;base64," + pendingImage); }
    catch (err) { msg($("#formMsg"), err.message, "err"); }
  });
  $("#imgClear").addEventListener("click", () => { pendingImage = null; $("#image").value = ""; $("#imageFile").value = ""; setPreview(""); });

  let saved = ""; try { saved = localStorage.getItem("hoj_token") || ""; } catch (_) {}
  if (saved) tryLogin(saved); else { $("#login").hidden = false; }
})();
