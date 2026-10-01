/* 관리자: 비밀번호 로그인 후 /api 로 데이터와 사진을 저장합니다. */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const hearts = n => { const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return r ? `<span class="hearts">${"♥".repeat(r)}<i>${"♥".repeat(5 - r)}</i></span>` : ""; };
  let state = null, editingId = null, editingSceneId = null, pendingImage = null; // pendingImage: { name, type, data }

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
  const showPanel = w => { $("#itemForm").hidden = w !== "item"; $("#sceneForm").hidden = w !== "scene"; $("#empty").hidden = w !== "empty"; };
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; $("#logout").hidden = true; setTimeout(() => $("#password").focus(), 50); }

  function renderList() {
    $("#count").textContent = state.items.length;
    $("#list").innerHTML = state.items.map(it => `
      <li data-id="${esc(it.id)}" class="${it.id === editingId ? "active" : ""}">
        <div class="th">${it.image ? `<img src="${esc(it.image)}" alt="">` : ""}</div>
        <div><b>${esc(it.name)}</b><small>${esc(catLabel(it.category))} · ${esc(it.price || "")}</small></div>${hearts(it.rating)}
      </li>`).join("") || `<li class="help" style="cursor:default">아직 글이 없습니다.</li>`;
    $("#sceneList").innerHTML = state.scenes.map(sc => `
      <li data-scene="${esc(sc.id)}" class="${sc.id === editingSceneId ? "active" : ""}">
        <div class="th" style="display:grid;place-items:center;color:var(--ink-3);font-size:11px">${sc.items.length}</div>
        <div><b>${esc(sc.title)}</b><small>${esc(sc.body || "")}</small></div><span></span>
      </li>`).join("") || `<li class="help" style="cursor:default">장면이 없습니다.</li>`;
  }

  function setRating(v) { $("#rating").value = v; $("#heartpick").querySelectorAll("button").forEach(b => b.classList.toggle("on", Number(b.dataset.v) <= v)); $("#ratingLabel").textContent = v ? `${v} / 5` : "선택 안 함"; }
  function setPreview(src) { $("#imgprev").innerHTML = src ? `<img src="${esc(src)}" alt="">` : "<span>사진 없음</span>"; $("#imgClear").hidden = !src; }

  function openItem(id) {
    const f = $("#itemForm"); f.reset(); pendingImage = null; editingId = id; editingSceneId = null;
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
    const f = $("#sceneForm"); f.reset(); editingSceneId = id; editingId = null;
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

  fetch("/api/me", { credentials: "same-origin", cache: "no-store" }).then(r => r.json()).then(j => j.ok ? enter() : showLogin()).catch(showLogin);
})();
