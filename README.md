# PurAI Chat 🌟

Website chat AI modern berbasis **FastAPI + HTMX**, terkoneksi ke API PurAI streaming.

## Fitur

- ✅ **Streaming SSE** – respons AI tampil real-time karakter demi karakter
- ✅ **Markdown rendering** – tabel, kode, heading, bold, italic otomatis di-render
- ✅ **Mobile-first UI** – desain seperti aplikasi chat native
- ✅ **Multi-model** – Gemini 3 Flash, Gemini Pro, GPT-4o Mini
- ✅ **Multi-mode** – Standard, Creative, Precise
- ✅ **Riwayat chat** – disimpan di localStorage
- ✅ **Anti-bot** – token HMAC per-session + rate limiting
- ✅ **Anti-RE** – devtools detection, console poisoning, right-click blocking

## Struktur

```
purai/
├── main.py                    # FastAPI app utama
├── requirements.txt
├── static/
│   ├── css/
│   │   └── main.css           # Desain dark luxury
│   └── js/
│       ├── anti-re.js         # Shield anti reverse-engineering
│       └── app.js             # Chat logic + SSE streaming
└── templates/
    ├── index.html             # Shell utama (HTMX)
    └── partials/
        ├── user_message.html  # Bubble user
        └── ai_message.html    # Bubble AI
```

## Instalasi & Menjalankan

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. (Opsional) set secret key
export PURAI_SECRET="ganti-dengan-secret-kuat-anda"

# 3. Jalankan server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Buka `http://localhost:8000` di browser.

## Keamanan

### Anti-Bot
- **HMAC Token**: Setiap sesi mendapat token `IP:timestamp:signature` yang diverifikasi server
- **Rate Limiting**: Maksimal 20 request/menit per IP (in-memory; ganti Redis untuk produksi)
- **User-Agent Blocking**: curl, wget, python-requests, Postman, dll. diblokir
- **Input Validation**: prompt max 4096 char, model & mode di-whitelist, HTML di-strip

### Anti-Reverse Engineering
- **Devtools Detection**: Polling `debugger` timing + window size diff
- **Console Poisoning**: `console.log` dll. di-override dengan getter yang memicu shield
- **Right-Click Disabled**: `contextmenu` di-prevent
- **Keyboard Shortcuts Blocked**: F12, Ctrl+Shift+I/J/C/K, Ctrl+U/S
- **iframe Guard**: Menolak beroperasi di dalam iframe
- **Automation Detection**: Deteksi headless Chrome, Puppeteer, Selenium, WebDriver
- **Token Obfuscation**: Token di-XOR di HTML sebelum dikirim ke JS

### Untuk Produksi
- Ganti in-memory rate store dengan **Redis**
- Tambahkan **HTTPS** (Nginx + Certbot)
- Set `PURAI_SECRET` dari environment variable yang aman
- Tambahkan **Cloudflare** di depan untuk DDoS protection
- Pertimbangkan **Turnstile CAPTCHA** untuk verifikasi human tambahan

## Kustomisasi

### Menambah Model
Di `main.py`, tambahkan ke `ALLOWED_MODELS`:
```python
ALLOWED_MODELS = {"gemini-3-flash-preview", "model-baru"}
```
Di `templates/index.html`, tambahkan `<option>` di select model.

### Mengubah Rate Limit
```python
RATE_LIMIT_WIN = 60   # window dalam detik
RATE_LIMIT_MAX = 20   # max request per window
```
