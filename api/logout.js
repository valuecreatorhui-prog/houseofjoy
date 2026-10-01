const { clearSessionCookie } = require("./_lib");
module.exports = async (req, res) => { res.setHeader("Set-Cookie", clearSessionCookie()); res.json({ ok: true }); };
