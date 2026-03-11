/* ════════════════════════════════════════════
   PurAI Chat — App Logic
════════════════════════════════════════════ */

const API_URL = 'https://www.puruboy.kozow.com/api/ai/notegpt';

// ── State ──
let currentModel = 'gemini-3-flash-preview';
let chatHistory = [];
let isStreaming = false;
let messageCount = 0;
let chatSessions = JSON.parse(localStorage.getItem('purai_sessions') || '[]');

// ── DOM Refs ──
const messagesEl = () => document.getElementById('chat-messages');
const inputEl    = () => document.getElementById('chat-input');
const sendBtnEl  = () => document.getElementById('send-btn');
const typingEl   = () => document.getElementById('typing-indicator');
const welcomeEl  = () => document.getElementById('welcome-screen');

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initModelPicker();
  renderHistoryList();
  inputEl()?.focus();
});

// ── Model Picker ──
function initModelPicker() {
  document.querySelectorAll('.model-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const radio = opt.querySelector('input[type=radio]');
      if (radio) {
        radio.checked = true;
        currentModel = radio.value;
      }
      const modelNameEl = document.getElementById('topbar-model-name');
      if (modelNameEl) {
        const name = opt.querySelector('.model-name')?.textContent || 'PurAI';
        modelNameEl.textContent = name;
      }
    });
  });
}

// ── Sidebar ──
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('visible', !isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
}

// ── Input Auto-resize ──
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ── Key Handling ──
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── Suggestion Chip ──
function sendSuggestion(btn) {
  const text = btn.textContent.replace(/^[^\s]+\s/, ''); // remove emoji
  inputEl().value = text;
  autoResize(inputEl());
  sendMessage();
}

// ── Send Message ──
async function sendMessage() {
  const input = inputEl();
  const prompt = input.value.trim();
  if (!prompt || isStreaming) return;

  // Remove welcome screen
  const welcome = welcomeEl();
  if (welcome) welcome.remove();

  // Add user bubble
  appendUserMessage(prompt);
  chatHistory.push({ role: 'user', content: prompt });
  input.value = '';
  input.style.height = 'auto';
  input.focus();

  // Show typing
  setStreaming(true);
  scrollToBottom();

  // Stream response
  await streamAIResponse(prompt);
}

// ── Append User Bubble ──
function appendUserMessage(text) {
  const row = createMessageRow('user', text);
  messagesEl().appendChild(row);
  scrollToBottom();
  messageCount++;

  // Save first message as session title
  if (messageCount === 1) {
    addToHistory(text.slice(0, 60));
  }
}

// ── Append AI Bubble ──
function appendAIMessage() {
  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.innerHTML = `
    <div class="message-avatar">✦</div>
    <div class="message-bubble stream-cursor" id="ai-bubble-${Date.now()}"></div>
  `;
  messagesEl().appendChild(row);
  scrollToBottom();
  return row.querySelector('.message-bubble');
}

// ── Create Message Row ──
function createMessageRow(role, text) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'P' : '✦';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'user') {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = parseMarkdown(text);
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  return row;
}

// ── Stream AI Response ──
async function streamAIResponse(prompt) {
  let bubble = null;
  let fullText = '';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: currentModel,
        chat_mode: 'standard'
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Hide typing, show bubble
    setTyping(false);
    bubble = appendAIMessage();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const json = trimmed.slice(5).trim();
        if (!json || json === '[DONE]') continue;

        try {
          const data = JSON.parse(json);
          if (data.type === 'finish') break;
          if (data.done) break;
          if (typeof data.text === 'string') {
            fullText += data.text;
            // Render markdown progressively
            bubble.innerHTML = parseMarkdown(fullText);
            scrollToBottom();
          }
        } catch (_) {
          // Ignore parse errors mid-stream
        }
      }
    }

    // Finalize
    if (bubble) {
      bubble.classList.remove('stream-cursor');
      bubble.innerHTML = parseMarkdown(fullText);
    }

    chatHistory.push({ role: 'assistant', content: fullText });

  } catch (err) {
    setTyping(false);
    if (bubble) {
      bubble.classList.remove('stream-cursor');
      bubble.innerHTML = `<span style="color:#fca5a5">⚠ Gagal mendapatkan respons. Coba lagi.</span>`;
    } else {
      appendErrorMessage(err.message);
    }
    console.error('Stream error:', err);
  } finally {
    setStreaming(false);
  }
}

// ── Error Message ──
function appendErrorMessage(msg) {
  const el = document.createElement('div');
  el.className = 'error-message';
  el.textContent = `⚠ Error: ${msg}`;
  messagesEl().appendChild(el);
  scrollToBottom();
}

// ── Streaming State ──
function setStreaming(active) {
  isStreaming = active;
  const btn = sendBtnEl();
  if (btn) btn.disabled = active;
  setTyping(active);
}

function setTyping(visible) {
  const el = typingEl();
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
  if (visible) scrollToBottom();
}

// ── Reset Chat ──
function resetChat() {
  chatHistory = [];
  messageCount = 0;
  const msgs = messagesEl();
  msgs.innerHTML = `
    <div class="welcome-screen" id="welcome-screen">
      <div class="welcome-glow"></div>
      <div class="welcome-icon">✦</div>
      <h1 class="welcome-title">PurAI</h1>
      <p class="welcome-subtitle">Asisten cerdas Anda. Tanyakan apa saja.</p>
      <div class="suggestion-chips">
        <button class="chip" onclick="sendSuggestion(this)">💡 Jelaskan quantum computing</button>
        <button class="chip" onclick="sendSuggestion(this)">✍️ Buatkan email profesional</button>
        <button class="chip" onclick="sendSuggestion(this)">🔢 Bantuan matematika</button>
        <button class="chip" onclick="sendSuggestion(this)">💻 Review kode Python</button>
      </div>
    </div>
  `;
  inputEl()?.focus();
}

// ── History ──
function addToHistory(title) {
  const session = { id: Date.now(), title, time: new Date().toISOString() };
  chatSessions.unshift(session);
  if (chatSessions.length > 20) chatSessions = chatSessions.slice(0, 20);
  localStorage.setItem('purai_sessions', JSON.stringify(chatSessions));
  renderHistoryList();
}

function renderHistoryList() {
  const list = document.getElementById('history-list');
  if (!list) return;
  if (chatSessions.length === 0) {
    list.innerHTML = '<p class="history-empty">Belum ada riwayat chat.</p>';
    return;
  }
  list.innerHTML = chatSessions.map(s => `
    <div class="history-item" title="${escapeHtml(s.title)}">
      ${escapeHtml(s.title)}
    </div>
  `).join('');
}

// ── Helpers ──
function scrollToBottom() {
  const msgs = messagesEl();
  if (msgs) requestAnimationFrame(() => {
    msgs.scrollTop = msgs.scrollHeight;
  });
}

function parseMarkdown(text) {
  if (typeof marked !== 'undefined') {
    try {
      return marked.parse(text, { breaks: true, gfm: true });
    } catch (_) {}
  }
  // Fallback: basic escape
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
