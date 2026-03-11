/**
 * PurAI App – Chat Logic
 * SSE streaming | HTMX partials | Token management
 */
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  const _state = {
    token: null,
    model: 'gemini-3-flash-preview',
    mode: 'standard',
    streaming: false,
    msgCounter: 0,
    history: [],            // [{role, text, id}]
    lastPrompt: '',
  };

  // ── Init ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    _initToken();
    _bindForm();
    _loadHistory();
    _startTokenRefresh();
  });

  function _initToken() {
    // Token was injected obfuscated via base64 in index.html
    try {
      const raw = window.__p;
      if (raw) { _state.token = raw; }
    } catch (_) {}
  }

  // Refresh token every 4 minutes (TTL is 5 min)
  function _startTokenRefresh() {
    setInterval(async () => {
      try {
        const r = await fetch('/token/refresh', { credentials: 'same-origin' });
        if (r.ok) {
          const d = await r.json();
          _state.token = d.token;
        }
      } catch (_) {}
    }, 4 * 60 * 1000);
  }

  // ── Form binding ────────────────────────────────────────────────────────────
  function _bindForm() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('prompt-input');
    const charCount = document.getElementById('char-count');

    if (!form || !input) return;

    input.addEventListener('input', () => {
      const len = input.value.length;
      charCount.textContent = `${len}/4096`;
      if (len > 3800) charCount.style.color = '#f87171';
      else if (len > 3000) charCount.style.color = '#fbbf24';
      else charCount.style.color = '';
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      _sendMessage();
    });
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  async function _sendMessage() {
    if (_state.streaming) return;

    // Human check
    if (window.__humanCheck && !window.__humanCheck()) {
      _toast('Interaksi tidak valid.');
      return;
    }

    const input = document.getElementById('prompt-input');
    const prompt = (input.value || '').trim();
    if (!prompt) return;
    if (prompt.length > 4096) { _toast('Pesan terlalu panjang.'); return; }

    _state.lastPrompt = prompt;
    input.value = '';
    autoResize(input);
    document.getElementById('char-count').textContent = '0/4096';

    // Hide welcome
    const welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.remove();

    // Render user bubble
    _appendUserMsg(prompt);

    // Show typing
    _setLoading(true);

    // Create AI bubble placeholder
    const msgId = ++_state.msgCounter;
    const aiBubble = _appendAiMsg(msgId);

    // Stream from backend
    await _streamResponse(prompt, msgId, aiBubble);
  }

  // ── Stream ──────────────────────────────────────────────────────────────────
  async function _streamResponse(prompt, msgId, aiBubble) {
    _state.streaming = true;
    const aiTextEl = document.getElementById(`ai-${msgId}`);
    if (aiTextEl) aiTextEl.classList.add('streaming');

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', _state.model);
    formData.append('chat_mode', _state.mode);

    let rawText = '';

    try {
      const response = await fetch('/chat/send', {
        method: 'POST',
        headers: {
          'X-Purai-Token': _state.token || '',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const msg = response.status === 429
          ? 'Terlalu banyak permintaan. Tunggu sebentar.'
          : response.status === 403
          ? 'Sesi tidak valid. Memuat ulang...'
          : `Error ${response.status}`;
        _showError(aiTextEl, msg);
        if (response.status === 403) setTimeout(() => location.reload(), 2000);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          let obj;
          try { obj = JSON.parse(raw); } catch (_) { continue; }

          if (obj.error) {
            _showError(aiTextEl, obj.error);
            break;
          }
          if (obj.done) break;
          if (obj.html !== undefined) {
            rawText += _unescapeHtml(obj.html);
            _renderMarkdown(aiTextEl, rawText);
            _scrollToBottom();
          }
        }
      }

    } catch (err) {
      _showError(aiTextEl, 'Koneksi gagal. Coba lagi.');
    } finally {
      // Remove streaming cursor
      if (aiTextEl) aiTextEl.classList.remove('streaming');

      // Show action buttons
      const actions = document.getElementById(`actions-${msgId}`);
      if (actions) actions.classList.remove('hidden');

      _setLoading(false);
      _state.streaming = false;

      // Save history
      _addToHistory(prompt, rawText);
      _scrollToBottom();
    }
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────────
  function _appendUserMsg(text) {
    const el = document.createElement('div');
    el.className = 'message user-message';
    el.innerHTML = `
      <div class="message-content">
        <p class="message-text">${_escapeHtml(text)}</p>
      </div>
      <div class="message-meta"><span class="msg-time">${_now()}</span></div>
    `;
    _getMessages().appendChild(el);
    _scrollToBottom();
  }

  function _appendAiMsg(msgId) {
    const el = document.createElement('div');
    el.className = 'message ai-message';
    el.innerHTML = `
      <div class="ai-avatar">✦</div>
      <div class="message-content">
        <div class="message-text ai-text" id="ai-${msgId}"></div>
        <div class="message-actions hidden" id="actions-${msgId}">
          <button class="action-btn" onclick="copyMsg('ai-${msgId}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Salin
          </button>
          <button class="action-btn" onclick="window._regenMsg()">↻ Ulangi</button>
        </div>
      </div>
      <div class="message-meta"><span class="msg-time">${_now()}</span></div>
    `;
    _getMessages().appendChild(el);
    _scrollToBottom();
    return el;
  }

  function _renderMarkdown(el, text) {
    if (!el) return;
    const parsed = marked.parse(text, { breaks: true, gfm: true });
    const clean  = DOMPurify.sanitize(parsed, { USE_PROFILES: { html: true } });
    el.innerHTML = clean;
  }

  function _showError(el, msg) {
    if (el) el.innerHTML = `<span style="color:#f87171">⚠ ${_escapeHtml(msg)}</span>`;
  }

  function _setLoading(on) {
    const btn = document.getElementById('send-btn');
    const typing = document.getElementById('typing-indicator');
    const input = document.getElementById('prompt-input');
    if (btn) { btn.disabled = on; btn.classList.toggle('loading', on); }
    if (typing) typing.classList.toggle('hidden', !on);
    if (input) input.disabled = on;
  }

  function _getMessages() {
    return document.getElementById('messages');
  }

  function _scrollToBottom() {
    const m = _getMessages();
    if (m) requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; });
  }

  // ── Utilities ────────────────────────────────────────────────────────────────
  function _escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function _unescapeHtml(s) {
    return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
            .replace(/&quot;/g,'"').replace(/&#039;/g,"'");
  }

  function _now() {
    const d = new Date();
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  let _toastTimeout;
  window._toast = function (msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
  };
  function _toast(msg) { window._toast(msg); }

  // ── History (localStorage) ───────────────────────────────────────────────────
  function _addToHistory(prompt, answer) {
    const item = {
      id: Date.now(),
      prompt: prompt.slice(0, 60),
      answer: answer.slice(0, 200),
      ts: Date.now(),
    };
    _state.history.unshift(item);
    if (_state.history.length > 20) _state.history.pop();
    try { localStorage.setItem('purai_hist', JSON.stringify(_state.history)); } catch (_) {}
    _renderHistory();
  }

  function _loadHistory() {
    try {
      const raw = localStorage.getItem('purai_hist');
      if (raw) _state.history = JSON.parse(raw);
    } catch (_) { _state.history = []; }
    _renderHistory();
  }

  function _renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';
    _state.history.slice(0, 10).forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.textContent = item.prompt + (item.prompt.length >= 60 ? '…' : '');
      el.title = item.prompt;
      list.appendChild(el);
    });
  }

  // ── Public API (called from HTML) ────────────────────────────────────────────
  window.toggleSidebar = function () {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (sb) sb.classList.toggle('open');
    if (ov) ov.classList.toggle('show');
  };

  window.newChat = function () {
    const m = _getMessages();
    if (m) m.innerHTML = '';
    if (_state.streaming) return;

    // Re-add welcome screen
    const welcome = document.createElement('div');
    welcome.className = 'welcome-screen';
    welcome.id = 'welcome-screen';
    welcome.innerHTML = `
      <div class="welcome-icon">✦</div>
      <h1 class="welcome-title">PurAI</h1>
      <p class="welcome-sub">Your intelligent companion.<br/>Ask anything.</p>
      <div class="suggestion-grid">
        <button class="suggestion-chip" onclick="fillPrompt('Jelaskan konsep machine learning dengan sederhana')">🧠 Apa itu Machine Learning?</button>
        <button class="suggestion-chip" onclick="fillPrompt('Buatkan kode Python untuk web scraping')">💻 Kode Python scraping</button>
        <button class="suggestion-chip" onclick="fillPrompt('Tuliskan email profesional untuk melamar kerja')">✉️ Email lamaran kerja</button>
        <button class="suggestion-chip" onclick="fillPrompt('Apa tren teknologi AI terbaru 2025?')">🚀 Tren AI 2025</button>
      </div>
    `;
    if (m) m.appendChild(welcome);
    _msgCounter = 0;

    // Close sidebar on mobile
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('show');
  };

  window.fillPrompt = function (text) {
    const input = document.getElementById('prompt-input');
    if (input) {
      input.value = text;
      input.focus();
      autoResize(input);
      document.getElementById('char-count').textContent = `${text.length}/4096`;
    }
  };

  window.updateModel = function (val) {
    _state.model = val;
    document.getElementById('form-model').value = val;
    const labels = { 'gemini-3-flash-preview': 'Gemini 3 Flash', 'gemini-pro': 'Gemini Pro', 'gpt-4o-mini': 'GPT-4o Mini' };
    const badge = document.getElementById('model-badge');
    if (badge) badge.textContent = labels[val] || val;
  };

  window.setMode = function (mode, btn) {
    _state.mode = mode;
    document.getElementById('form-mode').value = mode;
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
  };

  window.handleKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _sendMessage();
    }
  };

  window.autoResize = function (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  window.copyMsg = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.innerText || el.textContent;
    navigator.clipboard.writeText(text).then(() => _toast('Disalin!')).catch(() => _toast('Gagal menyalin.'));
  };

  window._regenMsg = function () {
    if (_state.streaming || !_state.lastPrompt) return;
    const m = _getMessages();
    // Remove last AI message
    const msgs = m ? m.querySelectorAll('.ai-message') : [];
    if (msgs.length > 0) msgs[msgs.length - 1].remove();
    // Re-send
    _setLoading(true);
    const msgId = ++_state.msgCounter;
    _appendAiMsg(msgId);
    _streamResponse(_state.lastPrompt, msgId, null);
  };

  window.regenMsg = window._regenMsg;

})();
