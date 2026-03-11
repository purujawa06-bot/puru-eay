/**
 * PurAI Chat – Express.js + HTMX
 * Port dari FastAPI Python ke Node.js
 */

import express from 'express';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import cookieParser from 'cookie-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const UPSTREAM_URL    = 'https://www.puruboy.kozow.com/api/ai/notegpt';
const SECRET_KEY      = process.env.PURAI_SECRET || 'ih_kok_tau_si';
const TOKEN_TTL       = 300;        // seconds
const MAX_PROMPT_LEN  = 4096;
const RATE_LIMIT_WIN  = 60;         // seconds
const RATE_LIMIT_MAX  = 20;
const ALLOWED_MODELS  = new Set(['gemini-3-flash-preview', 'gemini-pro', 'gpt-4o-mini']);
const ALLOWED_MODES   = new Set(['standard', 'creative', 'precise']);
const PORT            = process.env.PORT || 3000;

// ─── IN-MEMORY STORES ──────────────────────────────────────────────────────────
const _rateStore = new Map(); // ip -> [timestamps]

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(SECRET_KEY));

// Harden headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Server', 'PurAI/1.0');
  res.removeHeader('X-Powered-By');
  next();
});

// ─── SECURITY HELPERS ──────────────────────────────────────────────────────────
function _sign(payload) {
  return crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
}

function _getOrCreateSessionId(req, res) {
  let sid = req.signedCookies?.purai_sid;
  if (!sid) {
    sid = crypto.randomBytes(24).toString('hex');
    res.cookie('purai_sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      signed: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
  return sid;
}

function _makeToken(sid) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const raw = `${sid}:${ts}`;
  const sig = _sign(raw);
  return `${raw}:${sig}`;
}

function _verifyToken(token, sid) {
  try {
    // token format: sid:ts:sig
    const lastColon = token.lastIndexOf(':');
    const secondLastColon = token.lastIndexOf(':', lastColon - 1);
    if (lastColon === -1 || secondLastColon === -1) return false;
    const tokSid = token.slice(0, secondLastColon);
    const ts     = token.slice(secondLastColon + 1, lastColon);
    const sig    = token.slice(lastColon + 1);
    if (tokSid !== sid) return false;
    if (Math.abs(Date.now() / 1000 - parseInt(ts)) > TOKEN_TTL) return false;
    const expected = _sign(`${tokSid}:${ts}`);
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function _checkRate(ip) {
  const now = Date.now() / 1000;
  const hits = (_rateStore.get(ip) || []).filter(t => now - t < RATE_LIMIT_WIN);
  if (hits.length >= RATE_LIMIT_MAX) return false;
  hits.push(now);
  _rateStore.set(ip, hits);
  return true;
}

function _getIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return xff ? xff.split(',')[0].trim() : (req.socket?.remoteAddress || '0.0.0.0');
}

const BAD_UA = ['curl','wget','python-httpx','python-requests','go-http',
                'scrapy','postman','insomnia','httpie','axios/'];
function _uaBlock(ua) {
  const low = ua.toLowerCase();
  return BAD_UA.some(b => low.includes(b));
}

// ─── TEMPLATE ENGINE (sederhana, tanpa dependency) ─────────────────────────────
function renderTemplate(templatePath, vars = {}) {
  let html = readFileSync(templatePath, 'utf-8');
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{ ${key} }}`, val);
  }
  return html;
}

// ─── ROUTES ────────────────────────────────────────────────────────────────────

// GET / – halaman utama
app.get('/', (req, res) => {
  const sid = _getOrCreateSessionId(req, res);
  const token = _makeToken(sid);
  // XOR obfuscation seperti versi Python
  const k = 7;
  const obf = token.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ (i % k))
  ).join('');

  const html = renderTemplate(path.join(__dirname, 'views', 'index.html'), {
    csrf_token: obf,
  });
  res.send(html);
});

// GET /token/refresh – perbarui token CSRF
app.get('/token/refresh', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  if (_uaBlock(ua)) return res.status(403).json({ error: 'Forbidden' });
  const sid = _getOrCreateSessionId(req, res);
  const token = _makeToken(sid);
  res.json({ token });
});

// POST /chat/send – streaming chat ke upstream
app.post('/chat/send', async (req, res) => {
  const ip = _getIp(req);
  const ua = req.headers['user-agent'] || '';

  // Anti-bot UA
  if (_uaBlock(ua)) return res.status(403).send('Forbidden');

  // Token verification
  const sid = req.signedCookies?.purai_sid;
  const puraiToken = req.headers['x-purai-token'];
  if (!sid || !puraiToken || !_verifyToken(puraiToken, sid)) {
    return res.status(403).send('Invalid or expired session token.');
  }

  // Rate limit
  if (!_checkRate(ip)) {
    return res.status(429).send('Too many requests. Slow down.');
  }

  // Input validation
  let { prompt, model = 'gemini-3-flash-preview', chat_mode = 'standard' } = req.body;
  prompt = (prompt || '').trim();
  if (!prompt || prompt.length > MAX_PROMPT_LEN)
    return res.status(400).send('Invalid prompt length.');
  if (!ALLOWED_MODELS.has(model))
    return res.status(400).send('Model not allowed.');
  if (!ALLOWED_MODES.has(chat_mode))
    return res.status(400).send('Invalid chat mode.');

  // Sanitize: strip HTML tags
  prompt = prompt.replace(/<[^>]*>/g, '');

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendChunk = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    // Dynamically import node-fetch (ESM)
    const { default: fetch } = await import('node-fetch');

    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, chat_mode }),
      signal: AbortSignal.timeout(60000),
    });

    // Stream upstream SSE → client SSE
    let buffer = '';
    for await (const chunk of upstream.body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;

        let obj;
        try { obj = JSON.parse(raw); } catch { continue; }

        if (obj.type === 'finish' || obj.done) {
          sendChunk({ done: true });
          res.end();
          return;
        }

        const text = obj.text || '';
        if (text) {
          // Escape HTML seperti versi Python
          const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          sendChunk({ html: escaped });
        }
      }
    }

    sendChunk({ done: true });
  } catch (err) {
    sendChunk({ error: err.message || 'Upstream error' });
  } finally {
    res.end();
  }
});

// ─── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✦ PurAI Express running → http://localhost:${PORT}`);
});
