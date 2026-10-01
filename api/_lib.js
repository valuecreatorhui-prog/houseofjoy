// 공용: 세션 쿠키(HMAC 서명), 인증 확인, Blob 읽기/쓰기
const crypto = require("crypto");
const { put, list, del } = require("@vercel/blob");

const COOKIE = "hoj_session";
const DATA_PREFIX = "data/items-";   // 저장할 때마다 새 파일로 기록하고(캐시 회피), 가장 최근 파일을 읽습니다.
const KEEP_VERSIONS = 10;
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET 환경변수가 없습니다.");
  return s;
}
const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("hex");

function makeSessionCookie() {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  const value = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function isAuthed(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: "로그인이 필요합니다." });
  return false;
}
function checkPassword(input) {
  const want = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(String(input || "")), b = Buffer.from(want);
  return want.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

const newestFirst = blobs => blobs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt) || (b.pathname > a.pathname ? 1 : -1));

async function readData() {
  const { blobs } = await list({ prefix: DATA_PREFIX, limit: 1000 });
  if (!blobs.length) return require("../data/seed.json");
  const latest = newestFirst(blobs)[0];
  const r = await fetch(latest.url, { cache: "no-store" });
  return r.json();
}
async function writeData(data) {
  await put(`${DATA_PREFIX}${Date.now()}.json`, JSON.stringify(data, null, 2), {
    access: "public", contentType: "application/json; charset=utf-8", addRandomSuffix: true,
  });
  const { blobs } = await list({ prefix: DATA_PREFIX, limit: 1000 });
  const old = newestFirst(blobs).slice(KEEP_VERSIONS);
  if (old.length) await del(old.map(b => b.url));
}

module.exports = { makeSessionCookie, clearSessionCookie, isAuthed, requireAuth, checkPassword, readData, writeData };
