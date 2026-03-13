// ===== STATE =====
let conversationHistory = [];
let isLoading = false;
let chatCount = 0;

// ===== DOM REFS =====
const chatContainer   = document.getElementById('chatContainer');
const messagesWrapper = document.getElementById('messagesWrapper');
const welcomeScreen   = document.getElementById('welcomeScreen');
const typingIndicator = document.getElementById('typingIndicator');
const userInput       = document.getElementById('userInput');
const sendBtn         = document.getElementById('sendBtn');
const charCount       = document.getElementById('charCount');
const sidebar         = document.getElementById('sidebar');
const overlay         = document.getElementById('overlay');
const menuBtn         = document.getElementById('menuBtn');
const historyList     = document.getElementById('historyList');

// ===== SIDEBAR =====
menuBtn.addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.remove('hidden');
});

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.add('hidden');
}
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);

// ===== CHAR COUNT =====
userInput.addEventListener('input', () => {
  const len = userInput.value.length;
  charCount.textContent = `${len} / 4000`;
  charCount.style.color = len > 3500 ? '#f87171' : 'var(--text-muted)';
});

// ===== AUTO RESIZE =====
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ===== ENTER KEY =====
function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!isLoading && userInput.value.trim()) {
      document.getElementById('chatForm').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
    }
  }
}

// ===== HTMX: INJECT messages SEBELUM REQUEST DIKIRIM =====
// htmx:configRequest adalah waktu yang tepat — sebelum form di-serialize
document.body.addEventListener('htmx:configRequest', (e) => {
  if (e.target.id !== 'chatForm') return;

  const text = userInput.value.trim();

  // Batalkan jika kosong atau sedang loading
  if (!text || isLoading) {
    e.preventDefault();
    return;
  }

  isLoading = true;

  // Tambah ke history
  conversationHistory.push({ role: 'user', content: text });

  // Override parameters HTMX — ini yang akan dikirim sebagai form body
  e.detail.parameters = {
    messages: JSON.stringify(conversationHistory)
  };

  // Jangan override Content-Type — biarkan HTMX pakai urlencoded default
  delete e.detail.headers['Content-Type'];

  // Tampilkan pesan user di UI
  appendUserMessage(text);
  hideWelcome();
  typingIndicator.classList.remove('hidden');

  // Reset input
  userInput.value = '';
  userInput.style.height = 'auto';
  charCount.textContent = '0 / 4000';
  sendBtn.disabled = true;

  scrollToBottom();
});

// ===== HTMX: SETELAH RESPONSE =====
function onAfterRequest() {
  isLoading = false;
  sendBtn.disabled = false;
  typingIndicator.classList.add('hidden');

  // Simpan response AI ke history
  setTimeout(() => {
    const allAI = messagesWrapper.querySelectorAll('.assistant-message');
    const last  = allAI[allAI.length - 1];
    if (last && !last.classList.contains('error-message')) {
      const el = last.querySelector('.message-content');
      if (el) {
        conversationHistory.push({
          role: 'assistant',
          content: el.innerText || el.textContent
        });
      }
    }
    updateHistory();
    scrollToBottom();
  }, 80);
}

// Dipanggil dari hx-on::before-request (dibiarkan kosong — logic ada di configRequest)
function onBeforeRequest() {}

// ===== APPEND USER MESSAGE =====
function appendUserMessage(text) {
  const time    = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const escaped = escapeHtml(text).replace(/\n/g, '<br>');

  const div = document.createElement('div');
  div.className = 'message user-message';
  div.innerHTML = `
    <div class="message-avatar">
      <div class="avatar-user">U</div>
    </div>
    <div class="message-body">
      <div class="message-name">Kamu</div>
      <div class="message-bubble user-bubble">
        <div class="message-content">${escaped}</div>
      </div>
      <div class="message-time">${time}</div>
    </div>`;

  messagesWrapper.appendChild(div);

  div.style.opacity = '0';
  div.style.transform = 'translateY(10px)';
  div.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    div.style.opacity = '1';
    div.style.transform = 'translateY(0)';
  }));
}

// ===== HIDE WELCOME =====
function hideWelcome() {
  if (!welcomeScreen || welcomeScreen.classList.contains('hidden')) return;
  welcomeScreen.style.opacity = '0';
  welcomeScreen.style.transform = 'scale(0.96)';
  welcomeScreen.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  setTimeout(() => welcomeScreen.classList.add('hidden'), 300);
}

// ===== SCROLL =====
function scrollToBottom() {
  setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 80);
}

// ===== SUGGESTIONS =====
function sendSuggestion(text) {
  userInput.value = text;
  autoResize(userInput);
  charCount.textContent = `${text.length} / 4000`;
  document.getElementById('chatForm').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  );
}

// ===== NEW CHAT =====
function newChat() {
  conversationHistory = [];
  messagesWrapper.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  welcomeScreen.style.opacity = '1';
  welcomeScreen.style.transform = 'none';
  userInput.value = '';
  userInput.style.height = 'auto';
  charCount.textContent = '0 / 4000';
  closeSidebar();
  chatContainer.scrollTop = 0;
}

// ===== CLEAR CHAT =====
function clearChat() {
  if (conversationHistory.length === 0) return;
  conversationHistory = [];
  messagesWrapper.innerHTML = '';
  welcomeScreen.classList.remove('hidden');
  welcomeScreen.style.opacity = '1';
  welcomeScreen.style.transform = 'none';
  chatContainer.scrollTop = 0;
}

// ===== UPDATE HISTORY SIDEBAR =====
function updateHistory() {
  const userMsgs = conversationHistory.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return;

  if (historyList.querySelector('.history-empty')) {
    historyList.innerHTML = '';
    chatCount++;
  }

  if (!historyList.querySelector(`[data-chat="${chatCount}"]`)) {
    const label = userMsgs[0].content.slice(0, 32) +
      (userMsgs[0].content.length > 32 ? '…' : '');
    const item = document.createElement('div');
    item.className    = 'history-item';
    item.dataset.chat = chatCount;
    item.innerHTML    = `<span class="hist-icon">💬</span><span class="hist-label">${escapeHtml(label)}</span>`;
    item.addEventListener('click', () => closeSidebar());
    historyList.insertBefore(item, historyList.firstChild);
  }
}

// ===== UTILS =====
function escapeHtml(text) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}

// ===== INIT =====
userInput.focus();
