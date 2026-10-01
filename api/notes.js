// 개인 메모: 어드민 전용. 공개 데이터(/api/data)와 완전히 분리된 저장소에 AES-256-GCM으로 암호화해 보관합니다.
const crypto = require("crypto");
const { put, list, del } = require("@vercel/blob");
const { requireAuth } = require("./_lib");
const PREFIX = "private/notes-";
const KEEP = 10;

const key = () => crypto.createHash("sha256").update("notes:" + process.env.SESSION_SECRET).digest();
function encrypt(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: enc.toString("base64") });
}
function decrypt(json) {
  const o = JSON.parse(json); const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(o.iv, "base64"));
  d.setAuthTag(Buffer.from(o.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(o.data, "base64")), d.final()]).toString("utf8");
}
const newestFirst = blobs => blobs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt) || (b.pathname > a.pathname ? 1 : -1));

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
    if (!blobs.length) return res.json({ text: "", updatedAt: null });
    const latest = newestFirst(blobs)[0];
    const r = await fetch(latest.url, { cache: "no-store" });
    return res.json({ text: decrypt(await r.text()), updatedAt: latest.uploadedAt });
  }
  if (req.method === "PUT") {
    const text = String((req.body || {}).text ?? "");
    if (text.length > 200_000) return res.status(413).json({ error: "메모가 너무 깁니다." });
    await put(`${PREFIX}${Date.now()}.json`, encrypt(text), { access: "public", contentType: "application/json", addRandomSuffix: true });
    const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
    const old = newestFirst(blobs).slice(KEEP); if (old.length) await del(old.map(b => b.url));
    return res.json({ ok: true, updatedAt: new Date().toISOString() });
  }
  res.status(405).end();
};
