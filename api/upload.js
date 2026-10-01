// 사진 업로드: { name, type, data(base64) } → Blob 공개 URL
const { put } = require("@vercel/blob");
const { requireAuth } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireAuth(req, res)) return;
  const { name, type, data } = req.body || {};
  if (!data || !/^image\/(jpeg|png|webp)$/.test(type || "")) return res.status(400).json({ error: "이미지 파일만 올릴 수 있습니다." });
  const buf = Buffer.from(data, "base64");
  if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: "사진이 너무 큽니다." });
  const safe = String(name || "image").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  const blob = await put(`img/${safe}`, buf, { access: "public", contentType: type, addRandomSuffix: true });
  res.json({ url: blob.url });
};
