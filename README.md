# PurAI – Chat App

Chat interface modern berbasis **HTMX partials + Go** yang terhubung ke API AI PurAI dengan streaming SSE.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Go (stdlib, no framework) |
| Frontend | HTMX, Vanilla JS |
| Streaming | SSE (Server-Sent Events) |
| Markdown | marked.js |
| Font | Sora + JetBrains Mono |

## Struktur Project

```
purai/
├── main.go                  # Entry point, router
├── go.mod
├── handlers/
│   └── chat.go              # IndexHandler, ChatSendHandler (SSE proxy)
├── templates/
│   └── index.html           # Main HTML template
└── static/
    ├── css/style.css        # Dark glass mobile UI
    └── js/app.js            # Streaming chat logic
```

## Cara Jalankan

```bash
# 1. Masuk ke folder
cd purai

# 2. Jalankan server
go run main.go

# 3. Buka browser
open http://localhost:8080
```

## API yang Digunakan

```
POST https://www.puruboy.kozow.com/api/ai/notegpt
Content-Type: application/json

{
  "prompt": "...",
  "model": "gemini-3-flash-preview",
  "chat_mode": "standard"
}
```

Response berupa SSE stream dengan event:
- `data: {"text":"..."}` – token teks
- `data: {"text":"","done":true}` – selesai
- `data: {"type":"finish"}` – end

## Fitur

- 💬 Streaming real-time token per token
- 🌙 Dark glass UI, mobile-first (max 480px)
- 📝 Render Markdown (tabel, kode, list, heading)
- 🎨 Suggestion chips di welcome screen
- 📌 Auto-resize textarea
- ⬇️ Scroll-to-bottom button
- 🔄 Model selector (Gemini, GPT)
- ⚡ Tidak perlu framework eksternal

## Build Binary

```bash
go build -o purai-server .
./purai-server
```
