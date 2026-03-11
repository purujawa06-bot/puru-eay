"""
PurAI Chat - FastAPI + HTMX
Anti-bot, Anti-RE secured backend
"""
import os, time, hmac, hashlib, secrets, json, re
from typing import Optional
from fastapi import FastAPI, Request, Response, HTTPException, Header, Form
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import httpx

# ─── CONFIG ────────────────────────────────────────────────────────────────────
UPSTREAM_URL   = "https://www.puruboy.kozow.com/api/ai/notegpt"
SECRET_KEY     = os.getenv("PURAI_SECRET", secrets.token_hex(32))
TOKEN_TTL      = 300        # seconds token valid
MAX_PROMPT_LEN = 4096
RATE_LIMIT_WIN = 60         # seconds
RATE_LIMIT_MAX = 20         # requests per window per IP
ALLOWED_MODELS = {"gemini-3-flash-preview", "gemini-pro", "gpt-4o-mini"}
ALLOWED_MODES  = {"standard", "creative", "precise"}

# ─── IN-MEMORY STORES (swap for Redis in prod) ─────────────────────────────────
_rate_store: dict[str, list[float]] = {}
_session_tokens: dict[str, float]   = {}   # token -> expiry

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten for prod
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ─── SECURITY HELPERS ──────────────────────────────────────────────────────────

def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()

def _make_token(ip: str) -> str:
    ts = str(int(time.time()))
    raw = f"{ip}:{ts}"
    sig = _sign(raw)
    return f"{raw}:{sig}"

def _verify_token(token: str, ip: str) -> bool:
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
        tok_ip, ts, sig = parts
        if tok_ip != ip:
            return False
        if abs(time.time() - int(ts)) > TOKEN_TTL:
            return False
        expected = _sign(f"{tok_ip}:{ts}")
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False

def _check_rate(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _rate_store.get(ip, []) if now - t < RATE_LIMIT_WIN]
    if len(hits) >= RATE_LIMIT_MAX:
        return False
    hits.append(now)
    _rate_store[ip] = hits
    return True

def _get_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    return xff.split(",")[0].strip() if xff else (request.client.host or "0.0.0.0")

def _ua_block(ua: str) -> bool:
    """Block obvious bots/scrapers."""
    bad = ["curl", "wget", "python-httpx", "python-requests", "go-http",
           "scrapy", "postman", "insomnia", "httpie", "axios/"]
    ua_low = ua.lower()
    return any(b in ua_low for b in bad)


# ─── MIDDLEWARE: strip server info ─────────────────────────────────────────────

@app.middleware("http")
async def harden_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Server"] = "PurAI/1.0"
    response.headers.pop("x-powered-by", None)
    return response


# ─── ROUTES ────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    ip = _get_ip(request)
    token = _make_token(ip)
    return templates.TemplateResponse("index.html", {
        "request": request,
        "csrf_token": token,
    })


@app.post("/chat/send", response_class=StreamingResponse)
async def chat_send(
    request: Request,
    prompt: str = Form(...),
    model: str = Form("gemini-3-flash-preview"),
    chat_mode: str = Form("standard"),
    x_purai_token: Optional[str] = Header(None),
):
    ip = _get_ip(request)
    ua  = request.headers.get("user-agent", "")

    # ── anti-bot UA check ──
    if _ua_block(ua):
        raise HTTPException(403, "Forbidden")

    # ── token verification ──
    if not x_purai_token or not _verify_token(x_purai_token, ip):
        raise HTTPException(403, "Invalid or expired session token.")

    # ── rate limit ──
    if not _check_rate(ip):
        raise HTTPException(429, "Too many requests. Slow down.")

    # ── input validation ──
    prompt = prompt.strip()
    if not prompt or len(prompt) > MAX_PROMPT_LEN:
        raise HTTPException(400, "Invalid prompt length.")
    if model not in ALLOWED_MODELS:
        raise HTTPException(400, "Model not allowed.")
    if chat_mode not in ALLOWED_MODES:
        raise HTTPException(400, "Invalid chat mode.")

    # ── sanitize: strip script tags etc ──
    prompt = re.sub(r"<[^>]*>", "", prompt)

    async def stream_upstream():
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST", UPSTREAM_URL,
                    json={"prompt": prompt, "model": model, "chat_mode": chat_mode},
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    buffer = ""
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw:
                            continue
                        try:
                            obj = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        if obj.get("type") == "finish":
                            # Send final HTMX-friendly HTML chunk
                            yield _make_done_chunk()
                            return

                        if obj.get("done"):
                            yield _make_done_chunk()
                            return

                        text = obj.get("text", "")
                        if text:
                            buffer += text
                            # Stream partial HTML to HTMX
                            yield _make_text_chunk(text)

        except httpx.RequestError as exc:
            yield _make_error_chunk(str(exc))

    return StreamingResponse(
        stream_upstream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/token/refresh")
async def refresh_token(request: Request):
    """Client calls this to get a fresh CSRF token silently."""
    ua = request.headers.get("user-agent", "")
    if _ua_block(ua):
        raise HTTPException(403, "Forbidden")
    ip = _get_ip(request)
    token = _make_token(ip)
    return {"token": token}


# ─── SSE HTML CHUNK BUILDERS ───────────────────────────────────────────────────

def _make_text_chunk(text: str) -> str:
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"data: {json.dumps({'html': escaped})}\n\n"

def _make_done_chunk() -> str:
    return f"data: {json.dumps({'done': True})}\n\n"

def _make_error_chunk(msg: str) -> str:
    return f"data: {json.dumps({'error': msg})}\n\n"
