const { requireAuth, readData, writeData } = require("./_lib");
const isArr = Array.isArray;
module.exports = async (req, res) => {
  if (req.method === "GET") return res.json(await readData());
  if (req.method === "PUT") {
    if (!requireAuth(req, res)) return;
    const d = req.body;
    if (!d || !isArr(d.categories) || !isArr(d.scenes) || !isArr(d.items)) return res.status(400).json({ error: "형식이 올바르지 않습니다." });
    await writeData({ categories: d.categories, scenes: d.scenes, items: d.items });
    return res.json({ ok: true });
  }
  res.status(405).end();
};
