/**
 * @fileoverview The client runtime — shipped as a STRING constant and
 * served at the configured `ui.runtimePath` (no file read → works on
 * Workers and with `app.fetch()`). One delegated `click` + one `submit`
 * listener over `data-action` elements; no inline handlers anywhere
 * (`script-src 'self'` suffices). Requests carry `rapid-swap: 1` — the
 * only header the representer reads — plus `Accept: text/html` as a
 * courtesy to intermediaries (not consulted server-side).
 *
 * The programmatic surface is TWO functions — `window.rapid.swap(url,
 * target, opts?)` and `window.rapid.refresh(target)` — the sanctioned
 * way for app code to trigger (and repeat) swaps, e.g. multi-region
 * updates from a `rapid:swapped` listener, without synthesizing clicks.
 * Everything else (polling, history, transitions) stays
 * app-JS-over-events by design — the attribute surface is frozen.
 *
 * Invariants pinned by `ui.test.ts` over this source string: the exact
 * header names, the same-origin `rapid-redirect` guard, the csrf echo,
 * the frozen `window.rapid`, and the absence of inline handlers.
 *
 * @module
 */

import { djb2 } from '../utils/hash.ts';

/**
 * The swap runtime. Attributes: `data-action` (URL), `data-method`
 * (default `get`; forms default `post`), `data-target` (selector;
 * default: the element itself), `data-swap` = `replace` (default) |
 * `outer` | `append` | `prepend`. The `csrf` cookie is echoed as
 * `x-csrf-token` (names overridable via `data-csrf-cookie` /
 * `data-csrf-header` on `<body>`; a renamed `ui.swapHeader` /
 * `ui.redirectHeader` is followed via `data-swap-header` /
 * `data-redirect-header` likewise). Emits `rapid:swapped` after a
 * successful swap — detail `{ status, url, method, swap, title? }`, the
 * full swap identity (`title` decoded from the server's `rapid-title`
 * header when present) so listeners and the history module never
 * re-derive it — and `rapid:error` (with `{ status, body }`) when the
 * response is not swappable HTML; honours `rapid-redirect` to relative /
 * same-origin URLs only.
 *
 * Programmatic: `window.rapid.swap(url, target, { method?, swap?,
 * body? })` — `target` a selector or Element; resolves `true` when the
 * swap happened, `false` otherwise (error event fired, redirect
 * followed, or no such target) — and `window.rapid.refresh(target)`,
 * which re-fetches the last GET fragment swapped into `target`.
 */
export const UI_RUNTIME: string = `(() => {
  if (window.rapid && window.rapid.swap) return; // idempotent double load
  const doc = document;
  const cfg = doc.body ? doc.body.dataset : {};
  const CSRF_COOKIE = cfg.csrfCookie || 'csrf';
  const CSRF_HEADER = cfg.csrfHeader || 'x-csrf-token';
  const SWAP_HEADER = cfg.swapHeader || 'rapid-swap';
  const REDIRECT_HEADER = cfg.redirectHeader || 'rapid-redirect';

  const cookie = (name) => {
    const escaped = name.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    const match = doc.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    if (!match) return undefined;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  };

  // Replace and hand back the node rapid:swapped fires on — for 'outer'
  // that is the REPLACEMENT (the original is detached, so an event on it
  // could never bubble to document listeners).
  const apply = (target, mode, markup) => {
    if (mode === 'outer') {
      const parent = target.parentNode;
      const prev = target.previousSibling;
      target.outerHTML = markup;
      // *Element* walk: markup may open with whitespace, and the event
      // (and refresh keying) must land on the real replacement, never a
      // text node's parent.
      const first = prev
        ? prev.nextElementSibling
        : parent && parent.firstElementChild;
      return first instanceof Element ? first : parent || target;
    }
    if (mode === 'append') target.insertAdjacentHTML('beforeend', markup);
    else if (mode === 'prepend') target.insertAdjacentHTML('afterbegin', markup);
    else target.innerHTML = markup;
    return target;
  };

  const emit = (target, name, detail) =>
    target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

  // Last-write-wins per TARGET: a newer request aborts the older one at
  // ANY stage — fetch, body streaming, or pre-swap — so two rapid
  // clicks can never land out of order.
  const inflight = new WeakMap();
  // Each swapped node's GET source — what rapid.refresh() re-fetches.
  const sources = new WeakMap();

  const request = async (url, target, opts) => {
    if (!url || !target) return false;
    // Same-origin ONLY, like the redirect guard below: a request-derived
    // data-action must not ship the csrf header to a foreign host nor
    // swap a foreign response into the page. Relative URLs resolve
    // against the page and always pass; malformed ones are refused.
    try {
      if (new URL(url, location.href).origin !== location.origin) {
        return false;
      }
    } catch {
      return false;
    }
    const previous = inflight.get(target);
    if (previous) previous.abort();
    const controller = new AbortController();
    inflight.set(target, controller);
    const headers = { 'accept': 'text/html' };
    headers[SWAP_HEADER] = '1';
    const token = cookie(CSRF_COOKIE);
    if (token) headers[CSRF_HEADER] = token;
    const init = {
      method: (opts.method || 'get').toUpperCase(),
      headers,
      signal: controller.signal,
    };
    if (opts.body !== undefined) {
      // A FormData body (file inputs) keeps the browser's multipart
      // boundary; only string bodies are urlencoded.
      if (typeof opts.body === 'string') {
        headers['content-type'] = 'application/x-www-form-urlencoded';
      }
      init.body = opts.body;
    }
    try {
      let res;
      try {
        res = await fetch(url, init);
      } catch (error) {
        if (error && error.name === 'AbortError') return false;
        emit(target, 'rapid:error', { status: 0, body: String(error) });
        return false;
      }
      const redirect = res.headers.get(REDIRECT_HEADER);
      if (redirect) {
        // Server-set, but the rule costs nothing: relative or same-origin
        // ONLY — closes the open-redirect class by construction. A
        // malformed value is treated like a cross-origin one: ignored.
        try {
          const dest = new URL(redirect, location.href);
          if (dest.origin === location.origin) location.assign(dest.href);
        } catch { /* unparseable — ignore */ }
        return false;
      }
      let body;
      try {
        body = await res.text();
      } catch (error) {
        // An abort AFTER headers rejects here — the newer request wins.
        if (error && error.name === 'AbortError') return false;
        emit(target, 'rapid:error', {
          status: res.status,
          body: String(error),
        });
        return false;
      }
      const type = res.headers.get('content-type') || '';
      if (!res.ok || type.indexOf('text/html') !== 0) {
        // Never swap a non-HTML body (a JSON error envelope) into the page.
        emit(target, 'rapid:error', { status: res.status, body });
        return false;
      }
      if (controller.signal.aborted) return false;
      // Focus survives a swap: remember an id-carrying focused element
      // INSIDE the target and re-focus its replacement.
      const active = doc.activeElement;
      const focusId = active && active.id && target.contains(active)
        ? active.id
        : null;
      let swapped;
      const mutate = () => {
        swapped = apply(target, opts.swap, body);
      };
      try {
        // View Transitions when the browser has them — every swap gets
        // the native cross-fade for free; opt out in CSS via
        // ::view-transition-old(root), ::view-transition-new(root)
        // { animation: none }. The animation promises reject on hidden
        // documents / interrupted transitions AFTER the DOM already
        // mutated — observed here so they never surface as unhandled.
        if (doc.startViewTransition) {
          const transition = doc.startViewTransition(mutate);
          transition.ready.catch(() => {});
          transition.finished.catch(() => {});
          await transition.updateCallbackDone;
        } else {
          mutate();
        }
      } catch (error) {
        // apply() itself threw (a Trusted Types CSP, a detached outer
        // target) — the DOM is unchanged; report like any failed swap.
        emit(target, 'rapid:error', {
          status: res.status,
          body: String(error),
        });
        return false;
      }
      if (focusId) {
        const el = doc.getElementById(focusId);
        if (el) el.focus();
      }
      // Remember the fragment's source so rapid.refresh(target) can
      // re-fetch it without the caller knowing the URL — GET swaps only
      // (re-issuing a POST would repeat its side effects), and never
      // append/prepend (a "refresh" would re-append the fragment).
      if (init.method === 'GET') {
        if (opts.swap !== 'append' && opts.swap !== 'prepend') {
          sources.set(swapped, { url, swap: opts.swap });
        }
      } else if (swapped !== target) {
        // A non-GET outer swap discarded the keyed element — carry its
        // GET source onto the replacement, matching replace mode (where
        // the element, and so its source, persists).
        const source = sources.get(target);
        if (source) sources.set(swapped, source);
      }
      // The full swap identity rides the event so listeners (multi-region
      // chains, the history module) never re-derive it: url, method, the
      // effective swap mode, and — when the server stamped rapid-title —
      // the page title this fragment carries.
      const detail = {
        status: res.status,
        url,
        method: init.method,
        swap: opts.swap || 'replace',
      };
      const title = res.headers.get('rapid-title');
      if (title) {
        try { detail.title = decodeURIComponent(title); }
        catch { detail.title = title; }
      }
      emit(swapped, 'rapid:swapped', detail);
      return true;
    } finally {
      // Cleared only NOW: an entry deleted at the headers phase would
      // let a newer request find nothing to abort while this one still
      // streams — and land its stale body LAST.
      if (inflight.get(target) === controller) inflight.delete(target);
    }
  };

  const perform = (el, form, submitter) => {
    const target = el.dataset.target ? doc.querySelector(el.dataset.target) : el;
    let body;
    if (form) {
      const data = new FormData(form, submitter);
      let hasFile = false;
      data.forEach((value) => {
        if (typeof value !== 'string') hasFile = true;
      });
      body = hasFile ? data : new URLSearchParams(data).toString();
    }
    return request(el.dataset.action, target, {
      method: el.dataset.method || (form ? 'post' : 'get'),
      swap: el.dataset.swap,
      body,
    });
  };

  // The public API — swap + refresh: app code triggers swaps
  // (multi-region updates from a rapid:swapped listener) without
  // synthesizing clicks. Merged over any existing window.rapid so the
  // optional live bridge survives either load order.
  window.rapid = Object.freeze(Object.assign({}, window.rapid, {
    swap: (url, target, opts) =>
      request(
        url,
        typeof target === 'string' ? doc.querySelector(target) : target,
        opts || {},
      ),
    // Re-fetch the last GET fragment swapped into target — multi-region
    // refreshes without the listener knowing the URL. False when the
    // target never received a GET replace/outer swap (append/prepend
    // sources are never recorded).
    refresh: (target) => {
      const el = typeof target === 'string'
        ? doc.querySelector(target)
        : target;
      const source = el && sources.get(el);
      return source
        ? request(source.url, el, { swap: source.swap })
        : Promise.resolve(false);
    },
  }));

  doc.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target instanceof Element
      ? e.target.closest('[data-action]')
      : null;
    if (!el || el.tagName === 'FORM') return;
    // A real link INSIDE an action container keeps its native behavior.
    const link = e.target.closest('a[href]');
    if (link && link !== el) return;
    e.preventDefault();
    perform(el, null);
  });
  doc.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
    e.preventDefault();
    perform(form, form, e.submitter);
  });
})();
`;

/** Strong content-keyed ETag for a served script (`live.ts` reuses it). */
export const scriptEtag = (name: string, source: string): string =>
  `"${name}-${djb2(source)}"`;

/**
 * Strong ETag for the served runtime — content-keyed, so a package
 * upgrade that changes the script busts caches and an unchanged one
 * revalidates for free.
 */
export const UI_RUNTIME_ETAG: string = scriptEtag('rapid-ui', UI_RUNTIME);
