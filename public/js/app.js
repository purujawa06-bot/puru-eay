// ===== STATE =====
let conversationHistory = [];
let isLoading = false;
let chatCount = 0;

// ===== DOM REFS =====
const chatContainer = document.getElementById('chatContainer');
const messagesWrapper = document.getElementById('messagesWrapper');
const welcomeScreen = document.getElementById('welcomeScreen');
const typingIndicator = document.getElementById('typingIndicator');
const userInput = document.getElementById('userInput');
const messagesInput = document.getElementById('messagesInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuBtn = document.getElementById('menuBtn');
const historyList = document.getElementById('historyList');

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
      submitForm();
    }
  }
}

// ===== SUBMIT =====
function submitForm() {
  const form = document.getElementById('chatForm');
  const event = new Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
}

// ===== BEFORE REQUEST (HTMX hook) =====
function onBeforeRequest() {
  const text = userInput.value.trim();
  if (!text || isLoading) return false;

  isLoading = true;

  // Add user message to history
  conversationHistory.push({ role: 'user', content: text });
  messagesInput.value = JSON.stringify(conversationHistory);

  // Show user message in UI
  appendUserMessage(text);

  // Hide welcome, show typing
  hideWelcome();
  typingIndicator.classList.remove('hidden');

  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';
  charCount.textContent = '0 / 4000';
  sendBtn.disabled = true;

  scrollToBottom();
}

// ===== AFTER REQUEST (HTMX hook) =====
function onAfterRequest(event) {
  isLoading = false;
  sendBtn.disabled = false;
  typingIndicator.classList.add('hidden');

  // Extract assistant text from the newly appended HTML
  setTimeout(() => {
    const allMessages = messagesWrapper.querySelectorAll('.assistant-message');
    const lastMsg = allMessages[allMessages.length - 1];
    if (lastMsg) {
      const content = lastMsg.querySelector('.message-content');
      if (content) {
        const text = content.innerText || content.textContent;
        conversationHistory.push({ role: 'assistant', content: text });
      }
    }
    updateHistory();
    scrollToBottom();
  }, 100);
}

// ===== APPEND USER MESSAGE =====
function appendUserMessage(text) {
  const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
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

  // Animate in
  requestAnimationFrame(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateY(10px)';
    div.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    requestAnimationFrame(() => {
      div.style.opacity = '1';
      div.style.transform = 'translateY(0)';
    });
  });
}

// ===== HIDE WELCOME =====
function hideWelcome() {
  if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
    welcomeScreen.style.opacity = '0';
    welcomeScreen.style.transform = 'scale(0.95)';
    welcomeScreen.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    setTimeout(() => welcomeScreen.classList.add('hidden'), 300);
  }
}

// ===== SCROLL =====
function scrollToBottom() {
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 100);
}

// ===== SUGGESTIONS =====
function sendSuggestion(text) {
  userInput.value = text;
  autoResize(userInput);
  charCount.textContent = `${text.length} / 4000`;
  submitForm();
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

  // Update or add current chat item
  const existing = historyList.querySelector(`[data-chat="${chatCount}"]`);
  if (!existing) {
    const label = userMsgs[0].content.slice(0, 32) + (userMsgs[0].content.length > 32 ? '…' : '');
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.chat = chatCount;
    item.innerHTML = `<span class="hist-icon">💬</span><span class="hist-label">${escapeHtml(label)}</span>`;
    item.addEventListener('click', () => closeSidebar());
    historyList.insertBefore(item, historyList.firstChild);
  }
}

// ===== UTILS =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// ===== HTMX CONFIG =====
document.body.addEventListener('htmx:configRequest', (e) => {
  // Replace form data with JSON-structured body
  const msg = messagesInput.value;
  e.detail.parameters = { messages: msg };
});

document.body.addEventListener('htmx:beforeRequest', (e) => {
  if (e.target.id !== 'chatForm') return;
  const text = userInput.value.trim();
  if (!text && conversationHistory.length === 0) {
    e.preventDefault();
  }
});

// Ensure content type for JSON
document.body.addEventListener('htmx:configRequest', (e) => {
  if (e.target.id === 'chatForm') {
    e.detail.headers['Content-Type'] = 'application/json';
  }
});

// ===== INIT =====
userInput.focus();
