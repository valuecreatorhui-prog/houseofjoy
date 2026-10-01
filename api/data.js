const { requireAuth, isAuthed, readData, writeData } = require("./_lib");
const isArr = Array.isArray;
function publicView(d) {   // 임시저장(draft) 글은 사이트에 내보내지 않습니다.
  const items = d.items.filter(i => !i.draft);
  const ids = new Set(items.map(i => i.id));
  return { categories: d.categories, scenes: d.scenes.map(s => ({ ...s, items: (s.items || []).filter(x => ids.has(x)) })), items };
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
    await writeData({ categories: d.categories, scenes: d.scenes, items: d.items });
    return res.json({ ok: true });
  }
  res.status(405).end();
};
