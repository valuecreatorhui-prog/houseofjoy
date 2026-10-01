const { checkPassword, makeSessionCookie } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const { password } = req.body || {};
  if (!checkPassword(password)) {
    await new Promise(r => setTimeout(r, 800)); // 무차별 대입 완화
    return res.status(401).json({ error: "비밀번호가 맞지 않습니다." });
  }
  res.setHeader("Set-Cookie", makeSessionCookie());
  res.json({ ok: true });
};
