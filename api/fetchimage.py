"""링크의 사진 한 장을 서버에서 받아 긴 변 1600px JPEG(base64)로 돌려줍니다. 브라우저가 직접 받으면 편집(캔버스)할 수 없어서 거칩니다."""
import base64, io, json, time, urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, quote
from PIL import Image, ImageOps
import importlib.util, os
_c = importlib.util.spec_from_file_location("cutout", os.path.join(os.path.dirname(__file__), "cutout.py")); cutout = importlib.util.module_from_spec(_c); _c.loader.exec_module(cutout)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
MAX = 20 * 1024 * 1024


def fetch(url: str) -> bytes:
    o = urlparse(url)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": f"{o.scheme}://{o.netloc}/", "Accept": "image/*,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read(MAX + 1)


def to_jpeg(raw: bytes) -> bytes:
    im = Image.open(io.BytesIO(raw)); im.load()
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[3]); im = bg
    im = im.convert("RGB"); im.thumbnail((1600, 1600), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90, optimize=True); return buf.getvalue()


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        if not cutout.authed(self.headers):
            return self._json(401, {"error": "로그인이 필요합니다."})
        try:
            n = int(self.headers.get("Content-Length") or 0); payload = json.loads(self.rfile.read(n) or b"{}")
            src = str(payload.get("src") or "").strip()
            if not src.startswith(("http://", "https://")):
                return self._json(400, {"error": "지원하지 않는 주소입니다."})
            try:
                raw = fetch(src)
            except Exception:
                if "pstatic.net" not in src: raise
                raw = fetch("https://search.pstatic.net/common/?autoRotate=true&type=w750_sharpen&src=" + quote(src, safe=""))
            if len(raw) > MAX: return self._json(413, {"error": "사진이 너무 큽니다."})
            return self._json(200, {"data": base64.b64encode(to_jpeg(raw)).decode(), "type": "image/jpeg"})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": f"가져오기 실패: {e}"})
