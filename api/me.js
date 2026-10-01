const { isAuthed } = require("./_lib");
module.exports = async (req, res) => res.json({ ok: isAuthed(req) });
