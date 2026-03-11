/**
 * PurAI – Anti Reverse-Engineering & Anti-Bot Shield
 * Obfuscated protection layer
 */
(function () {
  'use strict';

  // ── 1. DevTools detection ──────────────────────────────────────────────────
  const _thresh = 160;
  let _devOpen = false;

  function _checkDevtools() {
    const t0 = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const delta = performance.now() - t0;
    if (delta > _thresh) {
      _triggerShield('dt');
    }
    const wDiff = window.outerWidth - window.innerWidth;
    const hDiff = window.outerHeight - window.innerHeight;
    if (wDiff > 200 || hDiff > 200) {
      if (!_devOpen) { _devOpen = true; _triggerShield('dw'); }
    } else {
      _devOpen = false;
    }
  }

  // Poll silently
  setInterval(_checkDevtools, 3000);

  // ── 2. Console poisoning ───────────────────────────────────────────────────
  const _noop = () => {};
  try {
    const _c = window.console;
    const _orig = {};
    ['log', 'info', 'warn', 'error', 'debug', 'table', 'dir'].forEach(m => {
      _orig[m] = _c[m];
      Object.defineProperty(_c, m, {
        get: () => {
          _triggerShield('console');
          return _noop;
        },
        configurable: false,
      });
    });
    // Keep internal usage via closure
    window.__clog = _orig.log.bind(_orig);
    window.__cwarn = _orig.warn.bind(_orig);
  } catch (_) {}

  // ── 3. Right-click & keyboard shortcut blocking ───────────────────────────
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', e => {
    // F12
    if (e.key === 'F12') { e.preventDefault(); return false; }
    // Ctrl+Shift+I / J / C / U / K
    if (e.ctrlKey && e.shiftKey && ['I','J','C','K'].includes(e.key.toUpperCase())) {
      e.preventDefault(); return false;
    }
    // Ctrl+U (view source)
    if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault(); return false;
    }
    // Ctrl+S (save page)
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); return false;
    }
  });

  // ── 4. Source map / iframe guard ──────────────────────────────────────────
  if (window.self !== window.top) {
    // We're inside an iframe – refuse to operate
    document.documentElement.innerHTML = '';
    window.top.location = window.self.location;
  }

  // ── 5. Automation/bot fingerprint detection ───────────────────────────────
  function _detectBot() {
    const ua = navigator.userAgent.toLowerCase();
    const bads = ['headlesschrome','phantomjs','nightmare','selenium','webdriver',
                  'puppeteer','playwright','electron','slimerbrowser','casperjs'];
    if (bads.some(b => ua.includes(b))) _triggerShield('ua');
    if (navigator.webdriver === true) _triggerShield('wd');
    if (!navigator.languages || navigator.languages.length === 0) _triggerShield('lang');
    // Plugin absence typical of headless
    if (navigator.plugins.length === 0 && !/android|iphone|ipad/.test(ua)) _triggerShield('plug');
  }

  // ── 6. DOM tampering guard ────────────────────────────────────────────────
  const _trap = document.getElementById('__purai_trap');
  if (_trap) {
    const _obs = new MutationObserver(() => _triggerShield('dom'));
    _obs.observe(_trap, { attributes: true, childList: true, subtree: true });
  }

  // ── 7. Shield response ────────────────────────────────────────────────────
  let _shieldFired = false;
  function _triggerShield(reason) {
    if (_shieldFired) return;
    _shieldFired = true;
    // Silently poison state instead of alerting (harder to bypass)
    window.__p = null;
    window.__chatToken = null;
    // Reload after short delay (disorienting for attacker)
    setTimeout(() => { location.href = '/'; }, 800 + Math.random() * 400);
  }

  // ── 8. Object.freeze critical globals ────────────────────────────────────
  try {
    Object.freeze(Object.prototype);
  } catch (_) {}

  // ── 9. Timing-based human check ───────────────────────────────────────────
  let _firstInteraction = null;
  document.addEventListener('mousemove', () => {
    if (!_firstInteraction) _firstInteraction = Date.now();
  }, { once: true });
  document.addEventListener('touchstart', () => {
    if (!_firstInteraction) _firstInteraction = Date.now();
  }, { once: true });

  // Expose validator for app.js
  window.__humanCheck = function () {
    // Must have had some interaction or be on mobile
    const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
    return mobile || (_firstInteraction !== null);
  };

  // ── 10. Run bot detection ─────────────────────────────────────────────────
  _detectBot();

})();
