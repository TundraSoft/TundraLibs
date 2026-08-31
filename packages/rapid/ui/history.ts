/**
 * @fileoverview The OPT-IN history module — a third string-served script
 * (`ui.history: true` → `/__rapid/history.js`) that gives swap
 * navigation a working address bar and back button. NO DOM cache, ever:
 * a popstate RE-FETCHES the recorded URL into the recorded region (a
 * full navigation when the region is gone), so what back shows is
 * always what the server would serve — auth, etag, and `Vary` stay in
 * the path, and the snapshot-cache bug class (stale widgets, re-run
 * scripts) cannot exist here.
 *
 * Pushes are PER-INTERACTION opt-in, never automatic: `data-push` on a
 * `data-action` element (value optional — a page URL to push instead of
 * the fetched one), or `rapid.history.push(url, target, opts?)`
 * programmatically. The documented contract: only push URLs that are
 * themselves page routes (`prefer: 'html'`) — rapid's same-route
 * duality then makes reload/deep-link land on the full page, the
 * footgun htmx's `hx-push-url` is famous for. One history-bearing
 * region per page; the swapped node must carry an `id` (the restore
 * address).
 *
 * `document.title` syncs from the `rapid:swapped` detail's `title`
 * (the representer's `rapid-title` header) on pushed and restored
 * swaps only — an ordinary widget swap never retitles the tab.
 *
 * @module
 */

import { scriptEtag } from './ui.ts';

/**
 * The history module. Load-order-safe with the runtime and the live
 * bridge (each replaces `window.rapid` with a frozen merged copy; this
 * one only ADDS `rapid.history`). API: `rapid.history.push(url, target,
 * opts?)` — a `rapid.swap` that also pushes (opts.swap forwarded;
 * `opts.url` overrides the pushed URL). Declarative: `data-push` beside
 * `data-action`.
 */
export const UI_HISTORY: string = `(() => {
  if (window.rapid && window.rapid.history) return;
  const doc = document;
  const initial = location.pathname + location.search;
  // The interaction that WANTS a push — armed by a data-push click or
  // history.push(), consumed by the matching rapid:swapped. Last-write-
  // wins, mirroring the runtime's per-target request semantics.
  let pending = null;
  let restoring = false;

  const arm = (url, pushUrl) => {
    pending = { url, pushUrl: pushUrl || null };
  };

  // Capture phase: runs BEFORE the runtime's own listeners, so the
  // pending marker is set when the swap starts.
  doc.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target instanceof Element
      ? e.target.closest('[data-action]')
      : null;
    if (el && el.dataset.push !== undefined && el.tagName !== 'FORM') {
      arm(el.dataset.action, el.dataset.push);
    }
  }, true);
  doc.addEventListener('submit', (e) => {
    const form = e.target;
    if (
      form instanceof HTMLFormElement && form.dataset.action &&
      form.dataset.push !== undefined
    ) {
      arm(form.dataset.action, form.dataset.push);
    }
  }, true);

  doc.addEventListener('rapid:swapped', (e) => {
    const detail = e.detail || {};
    if (restoring) {
      // A back/forward re-fetch landed — sync the tab title, push nothing.
      restoring = false;
      if (detail.title) doc.title = detail.title;
      return;
    }
    if (!pending || pending.url !== detail.url) return;
    const armed = pending;
    pending = null;
    const region = e.target;
    if (!(region instanceof Element) || !region.id) {
      // No id, no restore address — refuse the push rather than mint an
      // entry back can never honour.
      console.warn('[rapid.history] swapped region needs an id to push');
      return;
    }
    const target = '#' + region.id;
    // First push: stamp the INITIAL entry so back-to-start restores too.
    if (!history.state || !history.state.__rapidHistory) {
      history.replaceState(
        { __rapidHistory: { url: initial, target, swap: detail.swap } },
        '',
      );
    }
    history.pushState(
      { __rapidHistory: { url: detail.url, target, swap: detail.swap } },
      '',
      armed.pushUrl || detail.url,
    );
    if (detail.title) doc.title = detail.title;
  });

  addEventListener('popstate', (e) => {
    // Only OUR entries — anything else (a hash change, another
    // library's state) keeps the browser's default behavior.
    const entry = e.state && e.state.__rapidHistory;
    if (!entry) return;
    const region = doc.querySelector(entry.target);
    if (!region || !window.rapid || !window.rapid.swap) {
      // The region is gone (an outer swap replaced the shell) — a full
      // navigation is the honest restore.
      location.assign(entry.url);
      return;
    }
    restoring = true;
    window.rapid.swap(entry.url, region, { swap: entry.swap }).then((ok) => {
      if (!ok) {
        restoring = false;
        location.assign(entry.url);
      }
    });
  });

  window.rapid = Object.freeze(Object.assign({}, window.rapid, {
    history: Object.freeze({
      // A rapid.swap that also pushes: opts.swap forwards; opts.url
      // overrides the pushed URL (else the fetched one).
      push(url, target, opts) {
        arm(url, opts && opts.url);
        return window.rapid.swap(url, target, opts || {});
      },
    }),
  }));
})();
`;

/** Strong content-keyed ETag for the served history module. */
export const UI_HISTORY_ETAG: string = scriptEtag('rapid-history', UI_HISTORY);
