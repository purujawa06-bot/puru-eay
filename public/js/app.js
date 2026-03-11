/**
 * PurAI App – Chat Logic
 * SSE streaming | 10 chat rooms | Session memory (last 10 msgs) | Reasoning display
 */
(function () {
  'use strict';

  const MAX_ROOMS       = 10;
  const MAX_SESSION_CTX = 10;
  const LS_ROOMS_KEY    = 'purai_rooms';
  const LS_MSGS_PREFIX  = 'purai_msgs_';

  const _state = {
    token: null,
    model: 'puruboy-flash',
    mode: 'standard',
    systemPrompt: '',
    streaming: false,
    msgCounter: 0,
    lastPrompt: '',
    currentRoomId: null,
    sessionCtx: [],
  };

  document.addEventListener('DOMContentLoaded', () => {
    _initToken();
    _bindForm();
    _startTokenRefresh();
    _initRooms();
  });

  function _initToken() {
    try { const raw = window.__p; if (raw) _state.token = raw; } catch (_) {}
  }

  function _startTokenRefresh() {
    setInterval(async () => {
      try {
        const r = await fetch('/token/refresh', { credentials: 'same-origin' });
        if (r.ok) { const d = await r.json(); _state.token = d.token; }
      } catch (_) {}
    }, 4 * 60 * 1000);
  }

  // ── Rooms ────────────────────────────────────────────────────────────────────
  function _loadRooms() {
    try { const raw = localStorage.getItem(LS_ROOMS_KEY); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  }
  function _saveRooms(rooms) {
    try { localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(rooms)); } catch (_) {}
  }
  function _loadRoomMessages(roomId) {
    try { const raw = localStorage.getItem(LS_MSGS_PREFIX + roomId); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  }
  function _saveRoomMessages(roomId, messages) {
    try { localStorage.setItem(LS_MSGS_PREFIX + roomId, JSON.stringify(messages)); } catch (_) {}
  }
  function _deleteRoomData(roomId) {
    try { localStorage.removeItem(LS_MSGS_PREFIX + roomId); } catch (_) {}
  }
  function _generateRoomId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function _initRooms() {
    let rooms = _loadRooms();
    if (rooms.length === 0) {
      const id = _generateRoomId();
      rooms = [{ id, title: 'Chat Baru', ts: Date.now() }];
      _saveRooms(rooms);
    }
    _switchRoom(rooms[0].id, false);
    _renderRoomList();
  }

  function _switchRoom(roomId, saveFirst) {
    _state.currentRoomId = roomId;
    _state.sessionCtx = [];
    _state.msgCounter = 0;
    _state.lastPrompt = '';
    const msgs = _loadRoomMessages(roomId);
    msgs.forEach(m => _state.sessionCtx.push({ role: m.role, content: m.text }));
    if (_state.sessionCtx.length > MAX_SESSION_CTX)
      _state.sessionCtx = _state.sessionCtx.slice(-MAX_SESSION_CTX);
    _renderRoomMessages(roomId);
    _renderRoomList();
  }

  function _createNewRoom() {
    if (_state.streaming) return;
    const rooms = _loadRooms();
    if (rooms.length >= MAX_ROOMS) {
      const oldest = rooms[rooms.length - 1];
      _deleteRoomData(oldest.id);
      rooms.pop();
    }
    const id = _generateRoomId();
    rooms.unshift({ id, title: 'Chat Baru', ts: Date.now() });
    _saveRooms(rooms);
    _switchRoom(id, true);
  }

  function _updateRoomTitle(roomId, firstPrompt) {
    const rooms = _loadRooms();
    const room = rooms.find(r => r.id === roomId);
    if (room && room.title === 'Chat Baru') {
      room.title = firstPrompt.slice(0, 40) + (firstPrompt.length > 40 ? '…' : '');
      _saveRooms(rooms);
      _renderRoomList();
    }
  }

  function _deleteRoom(roomId) {
    if (_state.streaming) return;
    let rooms = _loadRooms();
    _deleteRoomData(roomId);
    rooms = rooms.filter(r => r.id !== roomId);
    if (rooms.length === 0) {
      const id = _generateRoomId();
      rooms = [{ id, title: 'Chat Baru', ts: Date.now() }];
    }
    _saveRooms(rooms);
    if (_state.currentRoomId === roomId || rooms.length === 1)
      _switchRoom(rooms[0].id, false);
    _renderRoomList();
  }

  function _renderRoomList() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const rooms = _loadRooms();
    list.innerHTML = '';
    rooms.forEach(room => {
      const el = document.createElement('div');
      el.className = 'history-item' + (room.id === _state.currentRoomId ? ' active' : '');
      el.innerHTML = `<span class="history-item-title" title="${_escapeHtml(room.title)}">${_escapeHtml(room.title)}</span><button class="history-item-del" onclick="event.stopPropagation();window._deleteRoom('${room.id}')" title="Hapus">✕</button>`;
      el.addEventListener('click', () => {
        if (_state.streaming) { _toast('Tunggu respons selesai.'); return; }
        _switchRoom(room.id, true);
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('overlay');
        if (sb) sb.classList.remove('open');
        if (ov) ov.classList.remove('show');
      });
      list.appendChild(el);
    });
  }

  function _renderRoomMessages(roomId) {
    const container = _getMessages();
    if (!container) return;
    container.innerHTML = '';
    const msgs = _loadRoomMessages(roomId);
    if (msgs.length === 0) { _showWelcome(); return; }
    msgs.forEach(m => {
      if (m.role === 'user') _appendUserMsgStatic(m.text, m.time);
      else _appendAiMsgStatic(m.text, m.time, m.reasoning || '');
    });
    _scrollToBottom();
  }

  function _showWelcome() {
    const m = _getMessages();
    if (!m) return;
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
      </div>`;
    m.appendChild(welcome);
  }

  function _appendUserMsgStatic(text, time) {
    const el = document.createElement('div');
    el.className = 'message user-message';
    el.innerHTML = `<div class="message-content"><p class="message-text">${_escapeHtml(text)}</p></div><div class="message-meta"><span class="msg-time">${time||''}</span></div>`;
    _getMessages().appendChild(el);
  }

  function _appendAiMsgStatic(text, time, reasoning) {
    const msgId = ++_state.msgCounter;
    const el = document.createElement('div');
    el.className = 'message ai-message';
    const rHtml = reasoning ? `<details class="reasoning-block"><summary>💭 Lihat proses berpikir</summary><div class="reasoning-text">${_escapeHtml(reasoning)}</div></details>` : '';
    el.innerHTML = `<div class="ai-avatar">✦</div><div class="message-content">${rHtml}<div class="message-text ai-text" id="ai-${msgId}"></div><div class="message-actions" id="actions-${msgId}"><button class="action-btn" onclick="copyMsg('ai-${msgId}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Salin</button></div></div><div class="message-meta"><span class="msg-time">${time||''}</span></div>`;
    _getMessages().appendChild(el);
    const aiEl = document.getElementById(`ai-${msgId}`);
    if (aiEl && text) _renderMarkdown(aiEl, text);
    return el;
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
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
    form.addEventListener('submit', e => { e.preventDefault(); _sendMessage(); });
  }

  // ── Send ─────────────────────────────────────────────────────────────────────
  async function _sendMessage() {
    if (_state.streaming) return;
    if (window.__humanCheck && !window.__humanCheck()) { _toast('Interaksi tidak valid.'); return; }
    const input = document.getElementById('prompt-input');
    const prompt = (input.value || '').trim();
    if (!prompt) return;
    if (prompt.length > 4096) { _toast('Pesan terlalu panjang.'); return; }

    _state.lastPrompt = prompt;
    input.value = '';
    autoResize(input);
    document.getElementById('char-count').textContent = '0/4096';

    const welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.remove();

    const timeNow = _now();
    _appendUserMsgLive(prompt, timeNow);
    _saveMessage({ role: 'user', text: prompt, time: timeNow });
    _state.sessionCtx.push({ role: 'user', content: prompt });
    if (_state.sessionCtx.length > MAX_SESSION_CTX) _state.sessionCtx.shift();
    _updateRoomTitle(_state.currentRoomId, prompt);
    _setLoading(true);
    const msgId = ++_state.msgCounter;
    const aiBubble = _appendAiMsgLive(msgId);
    await _streamResponse(prompt, msgId, aiBubble, timeNow);
  }

  function _saveMessage(msg) {
    if (!_state.currentRoomId) return;
    const msgs = _loadRoomMessages(_state.currentRoomId);
    msgs.push(msg);
    _saveRoomMessages(_state.currentRoomId, msgs);
  }

  // ── Stream ───────────────────────────────────────────────────────────────────
  async function _doFetch(prompt, token) {
    const body = new URLSearchParams();
    body.append('prompt', prompt);
    body.append('model', _state.model);
    body.append('chat_mode', _state.mode);
    if (_state.systemPrompt) body.append('system_prompt', _state.systemPrompt);
    return fetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Purai-Token': token || '', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString(),
      credentials: 'same-origin',
    });
  }

  async function _streamResponse(prompt, msgId, aiBubble, userTime) {
    _state.streaming = true;
    const aiTextEl = document.getElementById(`ai-${msgId}`);
    if (aiTextEl) aiTextEl.classList.add('streaming');
    let rawText = '';
    let rawReasoning = '';
    const aiTime = _now();

    try {
      let response = await _doFetch(prompt, _state.token);
      if (response.status === 403) {
        try {
          const r = await fetch('/token/refresh', { credentials: 'same-origin' });
          if (r.ok) { const d = await r.json(); _state.token = d.token; response = await _doFetch(prompt, _state.token); }
          else { _showError(aiTextEl, 'Sesi tidak valid. Memuat ulang...'); setTimeout(() => location.reload(), 2000); return; }
        } catch (_) { _showError(aiTextEl, 'Sesi tidak valid. Memuat ulang...'); setTimeout(() => location.reload(), 2000); return; }
      }
      if (!response.ok) {
        _showError(aiTextEl, response.status === 429 ? 'Terlalu banyak permintaan. Tunggu sebentar.' : `Error ${response.status}`);
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
          if (obj.error) { _showError(aiTextEl, obj.error); break; }
          if (obj.done) break;
          if (obj.reasoning !== undefined) {
            rawReasoning += obj.reasoning;
            _updateReasoningEl(aiBubble, rawReasoning);
          }
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
      if (aiTextEl) aiTextEl.classList.remove('streaming');
      const actions = document.getElementById(`actions-${msgId}`);
      if (actions) actions.classList.remove('hidden');
      _setLoading(false);
      _state.streaming = false;
      _saveMessage({ role: 'assistant', text: rawText, reasoning: rawReasoning, time: aiTime });
      if (rawText) {
        _state.sessionCtx.push({ role: 'assistant', content: rawText });
        if (_state.sessionCtx.length > MAX_SESSION_CTX) _state.sessionCtx.shift();
      }
      _scrollToBottom();
    }
  }

  function _updateReasoningEl(bubble, reasoningText) {
    if (!bubble || !reasoningText) return;
    let details = bubble.querySelector('.reasoning-block');
    if (!details) {
      details = document.createElement('details');
      details.className = 'reasoning-block';
      details.innerHTML = '<summary>💭 Lihat proses berpikir</summary><div class="reasoning-text"></div>';
      const content = bubble.querySelector('.message-content');
      if (content) content.insertBefore(details, content.firstChild);
    }
    const textEl = details.querySelector('.reasoning-text');
    if (textEl) textEl.textContent = reasoningText;
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────────
  function _appendUserMsgLive(text, time) {
    const el = document.createElement('div');
    el.className = 'message user-message';
    el.innerHTML = `<div class="message-content"><p class="message-text">${_escapeHtml(text)}</p></div><div class="message-meta"><span class="msg-time">${time}</span></div>`;
    _getMessages().appendChild(el);
    _scrollToBottom();
  }

  function _appendAiMsgLive(msgId) {
    const el = document.createElement('div');
    el.className = 'message ai-message';
    el.innerHTML = `<div class="ai-avatar">✦</div><div class="message-content"><div class="message-text ai-text" id="ai-${msgId}"></div><div class="message-actions hidden" id="actions-${msgId}"><button class="action-btn" onclick="copyMsg('ai-${msgId}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Salin</button><button class="action-btn" onclick="window._regenMsg()">↻ Ulangi</button></div></div><div class="message-meta"><span class="msg-time">${_now()}</span></div>`;
    _getMessages().appendChild(el);
    _scrollToBottom();
    return el;
  }

  function _renderMarkdown(el, text) {
    if (!el) return;
    el.innerHTML = DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }), { USE_PROFILES: { html: true } });
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

  function _getMessages() { return document.getElementById('messages'); }

  function _scrollToBottom() {
    const m = _getMessages();
    if (m) requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; });
  }

  function _escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function _unescapeHtml(s) {
    return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
  }

  function _now() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  let _toastTimeout;
  window._toast = function (msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
  };
  function _toast(msg) { window._toast(msg); }

  // ── Public API ───────────────────────────────────────────────────────────────
  window.toggleSidebar = function () {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('overlay')?.classList.toggle('show');
  };

  window.newChat = function () {
    _createNewRoom();
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('show');
  };

  window._deleteRoom = function (roomId) {
    if (confirm('Hapus percakapan ini?')) _deleteRoom(roomId);
  };

  window.fillPrompt = function (text) {
    const input = document.getElementById('prompt-input');
    if (input) {
      input.value = text; input.focus(); autoResize(input);
      document.getElementById('char-count').textContent = `${text.length}/4096`;
    }
  };

  window.updateSystemPrompt = function (val) {
    _state.systemPrompt = (val || '').trim();
    const hidden = document.getElementById('form-system-prompt');
    if (hidden) hidden.value = _state.systemPrompt;
    const badge = document.getElementById('sys-prompt-badge');
    if (badge) badge.classList.toggle('hidden', !_state.systemPrompt);
    const counter = document.getElementById('sys-char-count');
    if (counter) counter.textContent = `${val.length}/2048`;
  };

  window.clearSystemPrompt = function () {
    _state.systemPrompt = '';
    const ta = document.getElementById('system-prompt-input');
    if (ta) ta.value = '';
    const hidden = document.getElementById('form-system-prompt');
    if (hidden) hidden.value = '';
    const badge = document.getElementById('sys-prompt-badge');
    if (badge) badge.classList.add('hidden');
    const counter = document.getElementById('sys-char-count');
    if (counter) counter.textContent = '0/2048';
    _toast('System prompt dihapus.');
  };

  window.updateModel = function (val) {
    _state.model = val;
    document.getElementById('form-model').value = val;
    const labels = { 'puruboy-flash': 'PuruBoy Flash', 'puruboy-pro': 'PuruBoy Pro' };
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
  };

  window.autoResize = function (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  window.copyMsg = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText || el.textContent).then(() => _toast('Disalin!')).catch(() => _toast('Gagal menyalin.'));
  };

  window._regenMsg = function () {
    if (_state.streaming || !_state.lastPrompt) return;
    const m = _getMessages();
    const msgs = m ? m.querySelectorAll('.ai-message') : [];
    if (msgs.length > 0) msgs[msgs.length - 1].remove();
    if (_state.currentRoomId) {
      const stored = _loadRoomMessages(_state.currentRoomId);
      if (stored.length > 0 && stored[stored.length - 1].role === 'assistant') {
        stored.pop(); _saveRoomMessages(_state.currentRoomId, stored);
      }
    }
    if (_state.sessionCtx.length > 0 && _state.sessionCtx[_state.sessionCtx.length - 1].role === 'assistant')
      _state.sessionCtx.pop();
    _setLoading(true);
    const msgId = ++_state.msgCounter;
    _appendAiMsgLive(msgId);
    _streamResponse(_state.lastPrompt, msgId, null, _now());
  };

  window.regenMsg = window._regenMsg;

})();
