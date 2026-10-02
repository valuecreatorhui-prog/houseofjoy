const { requireAuth, isAuthed, readData, writeData } = require("./_lib");
const isArr = Array.isArray;
const idTime = id => { const m = /^(?:item|scene|cat)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(id || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6])).toISOString() : null; };   // id의 시각(한국시간) → UTC
function publicView(d) {   // 임시저장(draft) 글은 사이트에 내보내지 않습니다.
  const items = d.items.filter(i => !i.draft).map(({ sourceUrl, ...rest }) => rest);   // sourceUrl(사진 가져온 링크)은 어드민 전용
  const ids = new Set(items.map(i => i.id));
  return { categories: d.categories, scenes: d.scenes.map(s => ({ ...s, items: (s.items || []).filter(x => ids.has(x)) })), items, manualOrder: isArr(d.manualOrder) ? d.manualOrder : null, site: d.site || null };
}
module.exports = async (req, res) => {
  if (req.method === "GET") {
    const d = await readData();
    const all = /(?:^|[?&])all=1(?:&|$)/.test(req.url || "") && isAuthed(req);
    return res.json(all ? d : publicView(d));
  }
  if (req.method === "PUT") {
    if (!requireAuth(req, res)) return;
    const d = req.body;
    if (!d || !isArr(d.categories) || !isArr(d.scenes) || !isArr(d.items)) return res.status(400).json({ error: "형식이 올바르지 않습니다." });
    // 최초 게시 시각·작성 시각은 서버가 지킵니다: 어떤 화면에서 저장하든 한 번 정해진 값은 유지되고, 게시되는 순간 없으면 채웁니다.
    const prev = await readData(); const prevById = new Map(prev.items.map(i => [i.id, i])); const now = new Date().toISOString();
    const items = d.items.map(it => {
      const p = prevById.get(it.id) || {}; const out = { ...it };
      out.createdAt = p.createdAt || it.createdAt || idTime(it.id) || now;
      if (it.publishedAt === null) delete out.publishedAt;                                   // 명시적으로 지움
      else if (typeof it.publishedAt === "string" && !isNaN(Date.parse(it.publishedAt))) out.publishedAt = new Date(it.publishedAt).toISOString();   // 어드민이 정한 값
      else if (p.publishedAt) out.publishedAt = p.publishedAt;                                // 값을 안 보낸 오래된 화면 → 이전 값 유지
      else if (!it.draft) out.publishedAt = now;                                              // 처음 게시 → 지금
      else delete out.publishedAt;
      return out;
    });
    const site = d.site && typeof d.site === "object" && !isArr(d.site) ? d.site : (prev.site || null);
    const siteDraft = d.siteDraft === null ? null : (d.siteDraft && typeof d.siteDraft === "object" && !isArr(d.siteDraft) ? d.siteDraft : (prev.siteDraft || null));
    await writeData({ categories: d.categories, scenes: d.scenes, items, manualOrder: isArr(d.manualOrder) ? d.manualOrder.filter(x => typeof x === "string") : null, site, siteDraft });
    return res.json({ ok: true });
  }
  res.status(405).end();
};
