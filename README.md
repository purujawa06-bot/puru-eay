# PurAI Chat — HTMX Project

Website chat modern berbasis **HTMX partials** yang terhubung ke API PurAI (Gemini/GPT streaming).

---

## Struktur Project

```
purai-chat/
├── index.html                  # App shell utama
├── partials/
│   ├── new-chat.html           # Welcome screen (HTMX swap)
│   ├── message-user.html       # Template bubble user
│   ├── message-ai.html         # Template bubble AI
│   ├── typing.html             # Indikator mengetik
│   └── error.html              # Pesan error
└── static/
    ├── css/
    │   └── app.css             # Semua styling (dark theme)
    └── js/
        ├── app.js              # Logika utama chat
        └── stream.js           # SSE stream utility
```

---

## Cara Jalankan

### Option 1 — Static Server (direkomendasikan)

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8080
```

Buka: `http://localhost:8080`

### Option 2 — Langsung buka `index.html`
> ⚠ Streaming SSE mungkin tidak bekerja karena CORS di file:// protocol.
> Gunakan local server.

---

## API yang Digunakan

```
POST https://www.puruboy.kozow.com/api/ai/notegpt
Content-Type: application/json

{
  "prompt": "pesan user",
  "model": "gemini-3-flash-preview",
  "chat_mode": "standard"
}
```

Response: **Server-Sent Events (SSE)** — setiap chunk berformat:
```
data: {"text":"..."}
data: {"text":"","done":true}
data: {"type":"finish"}
```

---

## Model yang Didukung

| Model ID                  | Nama Tampilan  |
|---------------------------|----------------|
| `gemini-3-flash-preview`  | Gemini Flash   |
| `gemini-2.5-pro-preview`  | Gemini Pro     |
| `gpt-4o`                  | GPT-4o         |

---

## Fitur

- ✅ Streaming real-time via SSE
- ✅ Render Markdown (tabel, kode, bold, italic)
- ✅ Sidebar model picker
- ✅ Riwayat chat (localStorage)
- ✅ Suggestion chips
- ✅ Mobile responsive (sidebar drawer)
- ✅ Auto-resize textarea
- ✅ Dark theme dengan aurora glow
- ✅ HTMX untuk swap partial (new chat)

---

## Kustomisasi

**Ganti warna utama** di `static/css/app.css`:
```css
--purple: #8b5cf6;   /* Aksen utama */
--cyan:   #22d3ee;   /* Aksen sekunder */
--bg-base: #080b12;  /* Background */
```

**Ganti API endpoint** di `static/js/app.js`:
```js
const API_URL = 'https://www.puruboy.kozow.com/api/ai/notegpt';
```

---

## Teknologi

- [HTMX 1.9](https://htmx.org) — partial swapping
- [Marked.js 9](https://marked.js.org) — Markdown parsing
- Vanilla JS — streaming & state
- CSS custom properties — theming
- Google Fonts: Sora + JetBrains Mono
