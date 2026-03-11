# PurAI – Express.js + HTMX

Port dari FastAPI Python ke **Node.js + Express + HTMX**.

## Struktur Proyek

```
purai-express/
├── server.js          ← Backend Express (pengganti main.py)
├── package.json
├── views/
│   └── index.html     ← Template HTML (pengganti Jinja2)
└── public/
    ├── css/
    │   └── main.css   ← Design system (tidak berubah)
    └── js/
        ├── app.js     ← Chat logic SSE (tidak berubah)
        └── anti-re.js ← Anti-RE shield (tidak berubah)
```

## Instalasi & Menjalankan

```bash
npm install
npm start
# atau untuk development (auto-reload):
npm run dev
```

Buka browser → http://localhost:3000

## Environment Variables

| Variable       | Default             | Deskripsi                    |
|----------------|---------------------|------------------------------|
| `PURAI_SECRET` | random setiap start | HMAC secret untuk token CSRF |
| `PORT`         | `3000`              | Port server                  |

```bash
# Contoh production:
PURAI_SECRET=mysupersecret PORT=8080 npm start
```

## Perbandingan Python → Node.js

| FastAPI (Python)         | Express.js (Node.js)           |
|--------------------------|--------------------------------|
| `main.py`                | `server.js`                    |
| `Jinja2Templates`        | `renderTemplate()` (built-in)  |
| `StaticFiles`            | `express.static()`             |
| `StreamingResponse`      | `res.write()` + SSE manual     |
| `hmac.new(...)`          | `crypto.createHmac(...)`       |
| `hmac.compare_digest()`  | `crypto.timingSafeEqual()`     |
| `httpx.AsyncClient`      | `node-fetch` (stream)          |
| `Form(...)`              | `express.urlencoded()`         |
| `Header(...)`            | `req.headers['x-purai-token']` |

## Catatan

- Token CSRF TTL: 5 menit (300 detik), refresh otomatis tiap 4 menit
- Rate limit: 20 request / 60 detik per IP
- Streaming SSE dari upstream diteruskan langsung ke client
- Anti-bot & anti-RE logic tidak berubah (file JS sama)
