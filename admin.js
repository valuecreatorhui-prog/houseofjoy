/* 관리자: 비밀번호 로그인 후 /api 로 데이터와 사진을 저장합니다. */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const hearts = n => { const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return r ? `<span class="hearts">${"♥".repeat(r)}<i>${"♥".repeat(5 - r)}</i></span>` : ""; };
  let state = null, editingId = null, editingSceneId = null, editingCatId = null, pendingImage = null; // pendingImage: { name, type, data }

  /* ── API ── */
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (r.status === 401) { showLogin(); throw new Error("로그인이 필요합니다."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `${r.status}`);
    return j;
  }
  const loadData = async () => { state = await api("/api/data"); };
  const saveData = () => api("/api/data", { method: "PUT", body: JSON.stringify(state) });

  /* ── 이미지: 긴 변 1600px, JPEG 0.85 ── */
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

  /* ── UI ── */
  const msg = (el, text, cls = "") => { el.textContent = text; el.className = "msg " + cls; };
  const slug = p => { const d = new Date(), z = n => String(n).padStart(2, "0"); return `${p}-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
  const catLabel = id => (state.categories.find(c => c.id === id) || {}).label || id;
  const showPanel = w => { $("#itemForm").hidden = w !== "item"; $("#sceneForm").hidden = w !== "scene"; $("#catForm").hidden = w !== "cat"; $("#empty").hidden = w !== "empty"; };
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; $("#logout").hidden = true; setTimeout(() => $("#password").focus(), 50); }

  function renderList() {
    $("#count").textContent = state.items.length;
    $("#list").innerHTML = state.items.map(it => `
      <li data-id="${esc(it.id)}" class="${it.id === editingId ? "active" : ""}">
        <div class="th">${it.image ? `<img src="${esc(it.image)}" alt="">` : ""}</div>
        <div><b>${esc(it.name)}</b><small>${esc(catLabel(it.category))} · ${esc(it.price || "")}</small></div>${hearts(it.rating)}
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

  function setRating(v) { $("#rating").value = v; $("#heartpick").querySelectorAll("button").forEach(b => b.classList.toggle("on", Number(b.dataset.v) <= v)); $("#ratingLabel").textContent = v ? `${v} / 5` : "선택 안 함"; }
  function setPreview(src) {
    $("#imgprev").innerHTML = src ? `<img src="${esc(src)}" alt="">` : "<span>사진 없음</span>";
    $("#imgClear").hidden = !src; $("#cleanBtn").hidden = !src; $("#cleanHelp").hidden = !src; $("#compare").hidden = true;
  }
  /* 현재 사진(새로 고른 파일 또는 이미 올라간 URL)을 base64로 */
  async function currentImageBase64() {
    if (pendingImage) return pendingImage.data;
    const url = $("#image").value; if (!url) return null;
    const blob = await (await fetch(url, { cache: "no-store" })).blob();
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
  }
  let cleaned = null;
  async function cleanBackground() {
    const btn = $("#cleanBtn"); btn.disabled = true; btn.textContent = "정리 중…"; msg($("#formMsg"), "");
    try {
      const data = await currentImageBase64(); if (!data) throw new Error("사진이 없습니다.");
      const r = await fetch("/api/cutout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
      const j = await r.json().catch(() => ({})); if (r.status === 401) { showLogin(); return; } if (!r.ok) throw new Error(j.error || r.status);
      cleaned = { name: ((pendingImage && pendingImage.name) || "photo.jpg").replace(/\.[^.]+$/, "") + "-clean.jpg", type: "image/jpeg", data: j.data };
      $("#cmpBefore").src = "data:image/jpeg;base64," + data; $("#cmpAfter").src = "data:image/jpeg;base64," + j.data; $("#compare").hidden = false;
    } catch (err) { msg($("#formMsg"), "배경 정리 실패: " + err.message, "err"); }
    btn.disabled = false; btn.textContent = "배경 정리";
  }

  function openItem(id) {
    const f = $("#itemForm"); f.reset(); pendingImage = null; cleaned = null; editingId = id; editingSceneId = null; editingCatId = null;
    const it = id ? state.items.find(i => i.id === id) : null;
    $("#formTitle").textContent = it ? "글 수정" : "새 글"; $("#formId").textContent = it ? it.id : "";
    $("#category").innerHTML = state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("");
    $("#sceneChecks").innerHTML = state.scenes.map(sc => `<label><input type="checkbox" name="scene" value="${esc(sc.id)}" ${it && sc.items.includes(it.id) ? "checked" : ""}> ${esc(sc.title)}</label>`).join("") || `<span class="help">장면이 없습니다. 왼쪽에서 먼저 만들 수 있어요.</span>`;
    if (it) {
      f.category.value = it.category; f.name.value = it.name || ""; f.oneLine.value = it.oneLine || ""; f.price.value = it.price || ""; f.info.value = it.info || "";
      f.opinion.value = it.opinion || ""; f.forWhom.value = it.forWhom || ""; f.link.value = it.link || ""; f.tags.value = (it.tags || []).join(", ");
      $("#image").value = it.image || ""; setPreview(it.image || ""); setRating(it.rating || 0);
    } else { $("#image").value = ""; setPreview(""); setRating(0); }
    $("#deleteBtn").hidden = !it; msg($("#formMsg"), ""); showPanel("item"); renderList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitItem(e) {
    e.preventDefault();
    const f = $("#itemForm"), btn = $("#saveBtn"); btn.disabled = true; msg($("#formMsg"), "저장 중…");
    try {
      const id = editingId || slug("item");
      let image = $("#image").value;
      if (pendingImage) { msg($("#formMsg"), "사진 올리는 중…"); image = (await api("/api/upload", { method: "POST", body: JSON.stringify(pendingImage) })).url; }
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
      await saveData();
      editingId = id; $("#formId").textContent = id; $("#formTitle").textContent = "글 수정"; $("#deleteBtn").hidden = false; pendingImage = null; $("#image").value = image; setPreview(image);
      renderList(); msg($("#formMsg"), "저장했습니다. 사이트에 바로 반영됩니다.", "ok");
    } catch (err) { msg($("#formMsg"), "저장 실패: " + err.message, "err"); }
    btn.disabled = false;
  }
  async function deleteItem() {
    const it = state.items.find(i => i.id === editingId); if (!it || !confirm(`"${it.name}" 글을 삭제할까요?`)) return;
    msg($("#formMsg"), "삭제 중…");
    try { state.items = state.items.filter(i => i.id !== it.id); state.scenes.forEach(sc => sc.items = sc.items.filter(x => x !== it.id)); await saveData(); editingId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#formMsg"), "삭제 실패: " + err.message, "err"); }
  }

  function openScene(id) {
    const f = $("#sceneForm"); f.reset(); editingSceneId = id; editingId = null; editingCatId = null;
    const sc = id ? state.scenes.find(s => s.id === id) : null;
    $("#sceneFormTitle").textContent = sc ? "장면 수정" : "새 장면"; $("#sceneFormId").textContent = sc ? sc.id : "";
    if (sc) { f.title.value = sc.title; f.body.value = sc.body || ""; }
    $("#sceneDeleteBtn").hidden = !sc; msg($("#sceneMsg"), ""); showPanel("scene"); renderList();
  }
  async function submitScene(e) {
    e.preventDefault(); const f = $("#sceneForm"); msg($("#sceneMsg"), "저장 중…");
    try {
      const id = editingSceneId || slug("scene"); const idx = state.scenes.findIndex(s => s.id === id);
      const sc = { id, title: f.title.value.trim(), body: f.body.value.trim(), items: idx >= 0 ? state.scenes[idx].items : [] };
      if (idx >= 0) state.scenes[idx] = sc; else state.scenes.push(sc);
      await saveData(); editingSceneId = id; $("#sceneFormId").textContent = id; $("#sceneFormTitle").textContent = "장면 수정"; $("#sceneDeleteBtn").hidden = false;
      renderList(); msg($("#sceneMsg"), "저장했습니다.", "ok");
    } catch (err) { msg($("#sceneMsg"), "저장 실패: " + err.message, "err"); }
  }
  async function deleteScene() {
    const sc = state.scenes.find(s => s.id === editingSceneId); if (!sc || !confirm(`"${sc.title}" 장면을 삭제할까요? (글은 남습니다)`)) return;
    try { state.scenes = state.scenes.filter(s => s.id !== sc.id); await saveData(); editingSceneId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#sceneMsg"), "삭제 실패: " + err.message, "err"); }
  }

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
      const id = editingCatId || slug("cat"); const idx = state.categories.findIndex(c => c.id === id);
      if (idx >= 0) state.categories[idx] = { ...state.categories[idx], label }; else state.categories.push({ id, label });
      await saveData(); editingCatId = id; $("#catFormId").textContent = id; $("#catFormTitle").textContent = "갈래 수정"; $("#catDeleteBtn").hidden = false;
      renderList(); msg($("#catMsg"), "저장했습니다.", "ok");
    } catch (err) { msg($("#catMsg"), "저장 실패: " + err.message, "err"); }
  }
  async function deleteCat() {
    const c = state.categories.find(x => x.id === editingCatId); if (!c) return;
    const used = state.items.filter(i => i.category === c.id).length;
    if (used) return msg($("#catMsg"), `이 갈래에 글이 ${used}개 있어 삭제할 수 없습니다. 글의 갈래를 먼저 바꿔 주세요.`, "err");
    if (!confirm(`"${c.label}" 갈래를 삭제할까요?`)) return;
    try { state.categories = state.categories.filter(x => x.id !== c.id); await saveData(); editingCatId = null; renderList(); showPanel("empty"); }
    catch (err) { msg($("#catMsg"), "삭제 실패: " + err.message, "err"); }
  }

  /* ── 시작 ── */
  async function enter() { $("#login").hidden = true; $("#app").hidden = false; $("#logout").hidden = false; await loadData(); renderList(); showPanel("empty"); }

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
  $("#catList").addEventListener("click", e => { const li = e.target.closest("li[data-cat]"); if (li) openCat(li.dataset.cat); });
  $("#catForm").addEventListener("submit", submitCat);
  $("#catCancelBtn").addEventListener("click", () => { editingCatId = null; renderList(); showPanel("empty"); });
  $("#catDeleteBtn").addEventListener("click", deleteCat);
  $("#list").addEventListener("click", e => { const li = e.target.closest("li[data-id]"); if (li) openItem(li.dataset.id); });
  $("#sceneList").addEventListener("click", e => { const li = e.target.closest("li[data-scene]"); if (li) openScene(li.dataset.scene); });
  $("#itemForm").addEventListener("submit", submitItem);
  $("#cancelBtn").addEventListener("click", () => { editingId = null; renderList(); showPanel("empty"); });
  $("#deleteBtn").addEventListener("click", deleteItem);
  $("#sceneForm").addEventListener("submit", submitScene);
  $("#sceneCancelBtn").addEventListener("click", () => { editingSceneId = null; renderList(); showPanel("empty"); });
  $("#sceneDeleteBtn").addEventListener("click", deleteScene);
  $("#heartpick").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; const v = Number(b.dataset.v); setRating(v === Number($("#rating").value) ? 0 : v); });
  $("#imageFile").addEventListener("change", async e => { const file = e.target.files[0]; if (!file) return; try { pendingImage = await fileToJpeg(file); setPreview("data:image/jpeg;base64," + pendingImage.data); } catch (err) { msg($("#formMsg"), err.message, "err"); } });
  $("#imgClear").addEventListener("click", () => { pendingImage = null; $("#image").value = ""; $("#imageFile").value = ""; setPreview(""); });
  $("#cleanBtn").addEventListener("click", cleanBackground);
  $("#cmpUse").addEventListener("click", () => { if (!cleaned) return; pendingImage = cleaned; $("#image").value = ""; $("#imgprev").innerHTML = `<img src="data:image/jpeg;base64,${cleaned.data}" alt="">`; $("#compare").hidden = true; msg($("#formMsg"), "정리한 사진으로 바꿨습니다. 저장을 누르면 반영됩니다.", "ok"); });
  $("#cmpKeep").addEventListener("click", () => { cleaned = null; $("#compare").hidden = true; });

  fetch("/api/me", { credentials: "same-origin", cache: "no-store" }).then(r => r.json()).then(j => j.ok ? enter() : showLogin()).catch(showLogin);
})();
