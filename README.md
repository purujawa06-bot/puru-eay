# 🌟 PuruAI — Chat Intelligence

Website chat AI modern menggunakan **Express.js + HTMX**, powered by Gemini.

## 📋 Fitur

- 💬 Chat real-time dengan AI berbasis Gemini
- ✨ UI modern dengan animasi halus
- 📱 Responsive untuk mobile & desktop
- 🎨 Tema gelap elegan dengan efek glassmorphism
- 📝 Format Markdown (bold, italic, code, list)
- 🔄 Riwayat percakapan dalam sesi
- ⌨️ Typing indicator saat AI memproses
- 🚀 Lightweight — hanya HTML + JS vanilla (HTMX)

## 🚀 Instalasi

### Prasyarat
- Node.js v16 atau lebih baru
- npm / yarn

### Langkah

```bash
# 1. Install dependencies
npm install

# 2. Jalankan server
npm start

# 3. Buka browser
# http://localhost:3000
```

### Mode Development (auto-reload)
```bash
npm run dev
```

## 📁 Struktur Project

```
purai/
├── server.js          # Express server + API handler
├── package.json
├── public/
│   ├── index.html     # Frontend dengan HTMX
│   ├── css/
│   │   └── style.css  # Styling lengkap
│   └── js/
│       └── app.js     # JavaScript frontend
└── README.md
```

## 🔑 Cara Kerja

1. User mengetik pesan di input box
2. HTMX mengirim POST request ke `/api/chat`
3. Server mem-forward request ke Gemini API via batchexecute
4. Response dikembalikan sebagai HTML langsung ke chat
5. HTMX menyuntikkan HTML ke DOM tanpa refresh halaman

## ⚙️ Konfigurasi

Server berjalan di port **3000** secara default.
Ubah dengan environment variable:

```bash
PORT=8080 npm start
```

## 🎯 Shortcut Keyboard

| Shortcut | Aksi |
|----------|------|
| `Enter` | Kirim pesan |
| `Shift + Enter` | Baris baru |

---

Made with ❤️ — PuruAI v1.0
