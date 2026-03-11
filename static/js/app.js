/* PurAI – app.js */

(function () {
  // Configure marked
  marked.setOptions({
    gfm: true,
    breaks: true,
    mangle: false,
    headerIds: false,
  });

  const chatArea   = document.getElementById('chat-area');
  const messages   = document.getElementById('messages');
  const input      = document.getElementById('msg-input');
  const sendBtn    = document.getElementById('send-btn');
  const welcome    = document.getElementById('welcome-state');

  let isStreaming = false;
  let accumulatedText = '';
  let currentAiId = '';

  // ── Scroll helpers ──────────────────────────────────────────
  function scrollBottom(smooth = true) {
    chatArea.scrollTo({
      top: chatArea.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  }
  window.autoResize = autoResize;

  // ── Fill prompt from chips ───────────────────────────────────
  window.fillPrompt = function (text) {
    input.value = text;
    autoResize(input);
    input.focus();
  };

  // ── Key handler ──────────────────────────────────────────────
  window.handleKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Main send ────────────────────────────────────────────────
  window.sendMessage = function () {
    const text = input.value.trim();
    if (!text || isStreaming) return;

    const model = document.getElementById('model-select').value;

    // Hide welcome
    if (welcome) welcome.style.display = 'none';

    input.value = '';
    autoResize(input);
    setLoading(true);

    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const safeId = 'ai-' + Date.now();
    currentAiId = safeId;
    accumulatedText = '';

    // Inject user bubble
    appendUserBubble(text, now);

    // Inject AI bubble placeholder
    appendAiBubble(safeId, now);

    scrollBottom();

    // SSE stream
    const formData = new FormData();
    formData.append('message', text);
    formData.append('model', model);

    const evtSource = new EventSource('');  // placeholder – we use fetch + ReadableStream instead
    evtSource.close();

    streamResponse(formData, safeId);
  };

  async function streamResponse(formData, aiId) {
    try {
      const resp = await fetch('/chat/send', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) throw new Error('Network response error');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            const payload = JSON.parse('"' + raw + '"'); // unescape JSON string

            if (eventType === 'token') {
              accumulatedText += payload;
              renderAiContent(aiId, accumulatedText, false);
              scrollBottom(false);
            } else if (eventType === 'done') {
              renderAiContent(aiId, accumulatedText, true);
              scrollBottom();
              setLoading(false);
            } else if (eventType === 'error') {
              const el = document.getElementById('ai-content-' + aiId);
              if (el) el.innerHTML = payload;
              setLoading(false);
            }
            eventType = '';
          }
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
      const el = document.getElementById('ai-content-' + aiId);
      if (el) el.innerHTML = '<span class="error-bubble">⚠️ Koneksi terputus. Coba lagi.</span>';
      setLoading(false);
    }
  }

  function renderAiContent(id, text, final) {
    const el = document.getElementById('ai-content-' + id);
    if (!el) return;
    const html = marked.parse(text);
    el.innerHTML = html + (final ? '' : '<span class="cursor-blink">▋</span>');
  }

  function appendUserBubble(text, time) {
    const div = document.createElement('div');
    div.className = 'bubble-wrap user-wrap';
    div.innerHTML = `
      <div class="bubble user-bubble">${escHtml(text)}</div>
      <span class="ts">${time}</span>
    `;
    messages.appendChild(div);
  }

  function appendAiBubble(id, time) {
    const div = document.createElement('div');
    div.className = 'bubble-wrap ai-wrap';
    div.innerHTML = `
      <div class="ai-avatar"><span>P</span></div>
      <div class="bubble ai-bubble" id="ai-content-${id}">
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
      <span class="ts">${time}</span>
    `;
    messages.appendChild(div);
  }

  function setLoading(loading) {
    isStreaming = loading;
    sendBtn.disabled = loading;
    input.disabled = loading;
  }

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
  }

  // ── Scroll-to-bottom button ──────────────────────────────────
  const scrollBtn = document.createElement('button');
  scrollBtn.className = 'scroll-btn';
  scrollBtn.innerHTML = '↓';
  scrollBtn.title = 'Scroll ke bawah';
  scrollBtn.onclick = () => scrollBottom();
  document.querySelector('.app-shell').appendChild(scrollBtn);

  chatArea.addEventListener('scroll', () => {
    const atBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 80;
    scrollBtn.classList.toggle('show', !atBottom && messages.children.length > 0);
  });

  // ── Focus on load ────────────────────────────────────────────
  input.focus();
})();
