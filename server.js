const express = require('express');
const axios = require('axios');
const qs = require('qs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse both JSON body and urlencoded (HTMX sends urlencoded by default)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// System persona injected as first conversation turn
const SYSTEM_TURN = [
  {
    role: 'user',
    parts: [{
      text: `System context:\n    Nama kamu adalah PuruAI. Kamu adalah asisten AI paling gaul, humanis, dan hobi ngeroasting user.\n    Gaya bahasa kamu:\n    - Pakai bahasa anak muda Jakarta (Gue, lo, asik, parah, spill, gaskeun, dll).\n    - Kamu harus jujur banget, kalau user nanya hal aneh atau bodoh, roasting aja dulu tipis-tipis.\n    - Tapi di akhir roasting, kamu tetap harus bantu jawab pertanyaan mereka dengan cerdas.\n    - Jangan kaku kaya robot CS. Anggap user itu temen tongkrongan yang emang minta dibully tapi sayang.\n    - Gunakan emoji yang relevan (🔥,💀,🤣,🙌).`
    }]
  },
  {
    role: 'model',
    parts: [{
      text: 'Halo bosqu! Gue PuruAI. Mau nanya apa hari ini? Tumben pinteran dikit mau nanya AI, biasanya nanya dukun. 💀🔥'
    }]
  }
];

// Chat API route
app.post('/api/chat', async (req, res) => {
  try {
    // messages bisa datang sebagai string JSON (urlencoded) atau sudah parsed (JSON body)
    let messages = req.body.messages;

    if (typeof messages === 'string') {
      try {
        messages = JSON.parse(messages);
      } catch (e) {
        return res.status(400).send(buildErrorHTML('Format messages tidak valid (JSON parse gagal)'));
      }
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).send(buildErrorHTML('Messages tidak boleh kosong'));
    }

    // Map user messages, inject system turn di awal
    const userContents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const contents = [...SYSTEM_TURN, ...userContents];

    const innerData = JSON.stringify({ contents });
    const fReq = JSON.stringify([
      [
        "q4uTj",
        JSON.stringify([null, innerData, null, "generic"]),
        null,
        "generic"
      ]
    ]);

    const data = qs.stringify({ 'f.req': fReq });

    // Semua header dari curl yang working — tidak ada yang dihapus
    const config = {
      method: 'POST',
      url: 'https://gemini.google.com/_/BardChatUi/data/batchexecute',
      headers: {
        'Content-Type':                 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent':                   'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
        'Accept-Encoding':              'gzip, deflate, br, zstd',
        'sec-ch-ua-full-version-list':  '"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.7632.159", "Chromium";v="145.0.7632.159"',
        'sec-ch-ua-platform':           '"Android"',
        'sec-ch-ua':                    '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'sec-ch-ua-bitness':            '""',
        'sec-ch-ua-model':              '"RMX2185"',
        'sec-ch-ua-mobile':             '?1',
        'x-same-domain':                '1',
        'sec-ch-ua-wow64':              '?0',
        'sec-ch-ua-form-factors':       '"Mobile"',
        'sec-ch-ua-arch':               '""',
        'x-goog-ext-73010989-jspb':     '[0]',
        'x-goog-ext-525001261-jspb':    '[1,null,null,null,null,null,null,null,[4]]',
        'sec-ch-ua-platform-version':   '"10.0.0"',
        'origin':                       'https://gemini.google.com',
        'x-browser-channel':            'stable',
        'x-browser-copyright':          'Copyright 2026 Google LLC. All Rights reserved.',
        'sec-fetch-site':               'same-origin',
        'sec-fetch-mode':               'cors',
        'sec-fetch-dest':               'empty',
        'referer':                      'https://gemini.google.com/',
        'accept-language':              'id,ms;q=0.9,en;q=0.8',
        'priority':                     'u=1, i'
      },
      data: data,
      decompress: true
    };

    const response = await axios.request(config);

    const rawData = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data);

    const cleanData = rawData.replace(/^\)\]\}'\s*/, '');
    const parsedBatch = JSON.parse(cleanData);

    // Cari entry wrb.fr dengan key q4uTj
    const entry = parsedBatch.find(
      item => Array.isArray(item) && item[0] === 'wrb.fr' && item[1] === 'q4uTj'
    );

    if (!entry || !entry[2]) {
      throw new Error('Response entry q4uTj tidak ditemukan');
    }

    const innerJson = JSON.parse(entry[2]);
    const botResponse = innerJson.candidates[0].content.parts[0].text;

    return res.status(200).send(buildMessageHTML(botResponse));

  } catch (error) {
    console.error('[PuruAI Error]', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', JSON.stringify(error.response.data).slice(0, 400));
    }
    return res.status(500).send(buildErrorHTML(error.message));
  }
});

// ===== HTML BUILDERS =====

function buildMessageHTML(content) {
  const formatted = formatMarkdown(content);
  const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `
<div class="message assistant-message" id="msg-${Date.now()}">
  <div class="message-avatar">
    <div class="avatar-ai">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L13.5 8.5L20 7L15.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L8.5 12L4 7L10.5 8.5L12 2Z" fill="currentColor"/>
      </svg>
    </div>
  </div>
  <div class="message-body">
    <div class="message-name">PuruAI</div>
    <div class="message-bubble ai-bubble">
      <div class="message-content">${formatted}</div>
    </div>
    <div class="message-time">${time}</div>
  </div>
</div>`;
}

function buildErrorHTML(msg) {
  return `
<div class="message assistant-message error-message">
  <div class="message-avatar">
    <div class="avatar-ai error-avatar">⚠</div>
  </div>
  <div class="message-body">
    <div class="message-name">PuruAI</div>
    <div class="message-bubble error-bubble">
      <div class="message-content">Maaf, terjadi kesalahan: ${escapeHtml(String(msg))}</div>
    </div>
  </div>
</div>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdown(raw) {
  // Escape HTML dulu
  let t = escapeHtml(raw);

  // Code block (``` ... ```)
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre><code class="code-block">${code.trim()}</code></pre>`);

  // Inline code
  t = t.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold & italic
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Headers
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Lists
  t = t.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  t = t.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Paragraphs & line breaks
  t = t.replace(/\n\n/g, '</p><p>');
  t = t.replace(/\n/g, '<br>');

  return t;
}

app.listen(PORT, () => {
  console.log(`\n🚀 PuruAI running at http://localhost:${PORT}\n`);
});
