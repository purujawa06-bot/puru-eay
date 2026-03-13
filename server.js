const express = require('express');
const axios = require('axios');
const qs = require('qs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Chat API route
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: messages required' });
    }

    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

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

    const config = {
      method: 'POST',
      url: 'https://gemini.google.com/_/BardChatUi/data/batchexecute',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://gemini.google.com/',
        'x-same-domain': '1'
      },
      data: data
    };

    const response = await axios.request(config);

    const cleanData = response.data.replace(/^\)\]\}'\s*/, '');
    const parsedBatch = JSON.parse(cleanData);

    const innerJsonString = JSON.parse(parsedBatch[0][2]);
    const botResponse = innerJsonString.candidates[0].content.parts[0].text;

    // Return HTMX-compatible HTML response
    const html = buildMessageHTML('assistant', botResponse);
    return res.status(200).send(html);

  } catch (error) {
    console.error('API Error:', error.message);
    const errorHtml = buildErrorHTML(error.message);
    return res.status(500).send(errorHtml);
  }
});

function buildMessageHTML(role, content) {
  const escapedContent = escapeHtml(content);
  const formattedContent = formatMarkdown(escapedContent);
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
      <div class="message-content">${formattedContent}</div>
    </div>
    <div class="message-time">${time}</div>
  </div>
</div>`;
}

function buildErrorHTML(errorMsg) {
  return `
<div class="message assistant-message error-message">
  <div class="message-avatar">
    <div class="avatar-ai error-avatar">⚠</div>
  </div>
  <div class="message-body">
    <div class="message-name">PuruAI</div>
    <div class="message-bubble error-bubble">
      <div class="message-content">Maaf, terjadi kesalahan: ${escapeHtml(errorMsg)}</div>
    </div>
  </div>
</div>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdown(text) {
  return text
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="code-block">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+<\/li>)/g, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

app.listen(PORT, () => {
  console.log(`\n🚀 PuruAI running at http://localhost:${PORT}\n`);
});
