/**
 * @fileoverview The OPT-IN live bridge — a second string-served script
 * (`app.ui({ live: true })` → `/__rapid/live.js`) that subscribes to
 * server channels over the app's `/ws` rpc socket and turns broadcasts
 * into DOM events. It renders nothing and swaps nothing: app code maps
 * `rapid:push` to `rapid.swap()` (or anything else) in a listener —
 * events over attributes, and fragments stay HTTP-fetched so auth,
 * etag, compression, and `Vary` remain in the path.
 *
 * @module
 */

import { scriptEtag } from './ui.ts';

/**
 * The live bridge. Public API (merged onto `window.rapid`):
 * `rapid.live.connect(channel | channels[])` — opens the socket
 * (`data-live-path` on `<body>` overrides the default `/ws`),
 * subscribes, resubscribes on reconnect with capped backoff;
 * `rapid.live.disconnect()` closes it. DOM events on `document`:
 * `rapid:push` `{ channel, data }` per broadcast on a subscribed
 * channel, `rapid:live` `{ connected }` on every state change. Channels
 * must be declared server-side (`app.channel(name)`); publish with
 * `app.publish()` / `ctx.publish()`.
 *
 * @example the blog's whole live wiring
 * ```js ignore
 * rapid.live.connect('comments');
 * document.addEventListener('rapid:push', (e) => {
 *   if (e.detail.channel !== 'comments') return;
 *   rapid.swap('/posts/' + e.detail.data.postId + '/comments', '#comments');
 * });
 * ```
 */
export const UI_LIVE: string = `(() => {
  // Loaded twice (a layout mishap), the second copy would orphan an
  // immortal reconnect loop — the first copy wins.
  if (window.rapid && window.rapid.live) return;
  const doc = document;
  const channels = new Set();
  let ws = null;
  let wanted = false;
  let timer = null;
  let seq = 0;
  let delay = 2000;

  const emit = (name, detail) =>
    doc.dispatchEvent(new CustomEvent(name, { detail }));

  const sub = (channel) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ id: 'live-' + (++seq), type: 'sub', channel }));
    }
  };

  const open = () => {
    // Idempotent: never stack a second socket over a connecting/open
    // one, and never resurrect after disconnect() (a queued backoff
    // timer firing late).
    if (!wanted || (ws && ws.readyState <= 1)) return;
    const cfg = doc.body ? doc.body.dataset : {};
    ws = new WebSocket(
      (location.protocol === 'https:' ? 'wss://' : 'ws://') +
        location.host + (cfg.livePath || '/ws'),
    );
    ws.onopen = () => {
      delay = 2000;
      channels.forEach(sub);
      emit('rapid:live', { connected: true });
    };
    ws.onmessage = (ev) => {
      let frame;
      try { frame = JSON.parse(ev.data); } catch { return; }
      if (frame.type === 'msg' && channels.has(frame.channel)) {
        emit('rapid:push', { channel: frame.channel, data: frame.data });
      } else if (frame.type === 'result' && frame.ok === false) {
        // A refused subscribe (undeclared channel, authorize() veto)
        // would otherwise fail SILENTLY — pushes just never arriving.
        console.warn('[rapid.live] subscribe refused', frame);
      }
    };
    ws.onclose = () => {
      emit('rapid:live', { connected: false });
      if (wanted) {
        timer = setTimeout(open, delay);
        delay = Math.min(delay * 1.5, 15000);
      }
    };
  };

  // Merged over the swap runtime's window.rapid (either load order).
  window.rapid = Object.freeze(Object.assign({}, window.rapid, {
    live: Object.freeze({
      connect(list) {
        for (const channel of Array.isArray(list) ? list : [list]) {
          if (channel && !channels.has(channel)) {
            channels.add(channel);
            sub(channel);
          }
        }
        if (!wanted) {
          wanted = true;
          open();
        }
      },
      disconnect() {
        wanted = false;
        channels.clear();
        clearTimeout(timer);
        if (ws) {
          // Strip handlers first: the closing socket must not emit a
          // stale connected:false over a follow-up connect()'s socket.
          const old = ws;
          ws = null;
          old.onopen = null;
          old.onmessage = null;
          old.onclose = null;
          old.close();
          emit('rapid:live', { connected: false });
        }
      },
    }),
  }));
})();
`;

/** Strong content-keyed ETag for the served live bridge. */
export const UI_LIVE_ETAG: string = scriptEtag('rapid-live', UI_LIVE);
