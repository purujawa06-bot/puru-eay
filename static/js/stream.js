/* ════════════════════════════════════════════
   PurAI Chat — SSE Stream Utility
   Handles raw text/event-stream from API
════════════════════════════════════════════ */

/**
 * streamSSE — low-level SSE reader
 * @param {Response} res  - fetch Response with body stream
 * @param {Function} onChunk - called with each parsed text chunk
 * @param {Function} onDone  - called when stream ends
 */
async function streamSSE(res, onChunk, onDone) {
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const payload = JSON.parse(raw);

          // Handle finish signals
          if (payload.type === 'finish' || payload.done === true) {
            onDone?.();
            return;
          }

          // Text chunk
          if (typeof payload.text === 'string') {
            onChunk?.(payload.text);
          }
        } catch (_) {
          // Partial JSON mid-stream — skip
        }
      }
    }
  } catch (err) {
    console.warn('[streamSSE] Read error:', err);
    throw err;
  } finally {
    onDone?.();
    reader.releaseLock();
  }
}

/**
 * fetchAndStream — convenience wrapper over fetch + streamSSE
 */
async function fetchAndStream({ url, body, onChunk, onDone, onError }) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    await streamSSE(res, onChunk, onDone);

  } catch (err) {
    onError?.(err);
  }
}

// Export to global for use in app.js
window.streamSSE      = streamSSE;
window.fetchAndStream = fetchAndStream;
