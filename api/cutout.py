"""배경 정리: 사진에서 물건만 남기고, 사이트 톤의 옅은 회색 배경 위에 올려 4:5 JPEG로 돌려줍니다.
무료 오픈소스 모델 ISNet(DIS, Apache-2.0)을 onnxruntime으로 서버에서 실행합니다. 외부 유료 API 없음."""
import base64, hashlib, hmac, io, json, os, time, urllib.request
from http.server import BaseHTTPRequestHandler

import numpy as np
from PIL import Image, ImageFilter

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"
MODEL_PATH = os.environ.get("MODEL_PATH") or "/tmp/isnet-general-use.onnx"
_session = None


def session():
    global _session
    if _session is None:
        if not os.path.exists(MODEL_PATH):
            tmp = MODEL_PATH + ".part"
            urllib.request.urlretrieve(MODEL_URL, tmp)
            os.replace(tmp, MODEL_PATH)
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(1, os.cpu_count() or 1)
        _session = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=["CPUExecutionProvider"])
    return _session


def mask_for(img: Image.Image) -> Image.Image:
    """ISNet 추론 → 원본 크기의 L 마스크"""
    s = session()
    inp = img.convert("RGB").resize((1024, 1024), Image.LANCZOS)
    x = np.asarray(inp, dtype=np.float32) / 255.0
    x = (x - 0.5) / 1.0
    x = np.transpose(x, (2, 0, 1))[None, ...]
    out = s.run(None, {s.get_inputs()[0].name: x})[0][0, 0]
    out = (out - out.min()) / max(out.max() - out.min(), 1e-6)
    m = Image.fromarray((out * 255).astype(np.uint8), "L").resize(img.size, Image.LANCZOS)
    return m


def studio(img: Image.Image, W=1200, H=1500) -> Image.Image:
    """잘라낸 물건을 옅은 회색 그라데이션 배경 가운데에 놓고 부드러운 접지 그림자를 넣습니다."""
    m = mask_for(img)
    cut = img.convert("RGBA")
    cut.putalpha(m)
    bbox = m.point(lambda v: 255 if v > 40 else 0).getbbox()
    if not bbox:
        raise ValueError("물건을 찾지 못했습니다.")
    cut = cut.crop(bbox)
    scale = min((W * 0.78) / cut.width, (H * 0.74) / cut.height)
    cut = cut.resize((max(1, int(cut.width * scale)), max(1, int(cut.height * scale))), Image.LANCZOS)

    grad = Image.linear_gradient("L").resize((W, H))
    top = Image.new("RGBA", (W, H), (248, 248, 247, 255))
    bot = Image.new("RGBA", (W, H), (236, 236, 235, 255))
    canvas = Image.composite(bot, top, grad)

    x = (W - cut.width) // 2
    y = int(H * 0.55 - cut.height / 2)
    a = cut.split()[3]
    shadow = Image.new("RGBA", cut.size, (0, 0, 0, 0))
    shadow.putalpha(a.point(lambda v: int(v * 0.38)))
    shadow = shadow.resize((int(cut.width * 1.04), max(1, int(cut.height * 0.2))))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(shadow, (x - int(cut.width * 0.02), y + cut.height - shadow.height // 2 - 8), shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(40))
    canvas = Image.alpha_composite(canvas, layer)
    canvas.alpha_composite(cut, (x, y))
    return canvas.convert("RGB")


def process(image_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(image_bytes))
    img.load()
    out = studio(img)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=90, optimize=True)
    return buf.getvalue()


# ── 인증: api/_lib.js 와 같은 규칙의 세션 쿠키 확인 ──
def authed(headers) -> bool:
    secret = os.environ.get("SESSION_SECRET", "")
    cookie = headers.get("Cookie") or headers.get("cookie") or ""
    for part in cookie.split(";"):
        k, _, v = part.strip().partition("=")
        if k == "hoj_session" and "." in v:
            exp, sig = v.split(".", 1)
            if not exp.isdigit() or int(exp) < time.time() * 1000:
                return False
            want = hmac.new(secret.encode(), exp.encode(), hashlib.sha256).hexdigest()
            return hmac.compare_digest(sig, want)
    return False


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not authed(self.headers):
            return self._json(401, {"error": "로그인이 필요합니다."})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n) or b"{}")
            raw = base64.b64decode(payload.get("data") or "")
            if not raw:
                return self._json(400, {"error": "이미지가 없습니다."})
            t0 = time.time()
            out = process(raw)
            return self._json(200, {"data": base64.b64encode(out).decode(), "type": "image/jpeg", "seconds": round(time.time() - t0, 1)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": f"처리 실패: {e}"})
