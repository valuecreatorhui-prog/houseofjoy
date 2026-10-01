// 공용: 세션 쿠키(HMAC 서명), 인증 확인, Blob 읽기/쓰기
const crypto = require("crypto");
const { put, get } = require("@vercel/blob");

const COOKIE = "hoj_session";
const DATA_PATH = "data/items.json";
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

async function readData() {
  const r = await get(DATA_PATH, { access: "public", useCache: false });
  if (r && r.statusCode === 200) {
    const text = await new Response(r.stream).text();
    return JSON.parse(text);
  }
  return require("../data/seed.json");
}
async function writeData(data) {
  await put(DATA_PATH, JSON.stringify(data, null, 2), {
    access: "public", contentType: "application/json; charset=utf-8",
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
  });
}

module.exports = { makeSessionCookie, clearSessionCookie, isAuthed, requireAuth, checkPassword, readData, writeData };
