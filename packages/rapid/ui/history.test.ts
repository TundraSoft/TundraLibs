/**
 * @fileoverview The history module — the served route (gated, cached),
 * and the script source's pinned invariants (no DOM runner in CI — the
 * string is asserted directly, same honest limit as the runtime's).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { UI_HISTORY, UI_HISTORY_ETAG } from './history.ts';

describe('rapid.ui.history', () => {
  it('ui.history: true serves the module with the runtime caching contract; absent, the route does not exist', async () => {
    const on = await Application.initialize({
      name: 'history-on',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: { history: true },
    });
    const res = await on.fetch(new Request('http://app/__rapid/history.js'));
    asserts.assertEquals(res.headers.get('etag'), UI_HISTORY_ETAG);
    asserts.assertEquals(res.headers.get('cache-control'), 'no-cache');
    asserts.assertEquals(await res.text(), UI_HISTORY);
    const revalidated = await on.fetch(
      new Request('http://app/__rapid/history.js', {
        headers: { 'if-none-match': UI_HISTORY_ETAG },
      }),
    );
    asserts.assertEquals(revalidated.status, 304);
    await on.stop();

    const off = await Application.initialize({
      name: 'history-off',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
      ui: {},
    });
    const missing = await off.fetch(
      new Request('http://app/__rapid/history.js'),
    );
    asserts.assertEquals(missing.status, 404);
    await missing.body?.cancel();
    await off.stop();
  });

  it('the module source keeps its pinned invariants', () => {
    // Must PARSE — substring pins alone would pass a syntax regression.
    new Function(UI_HISTORY);
    // No inline handlers — CSP `script-src 'self'` must suffice.
    asserts.assertEquals(/\son\w+\s*=\s*["']/.test(UI_HISTORY), false);
    // Push is per-interaction opt-in: the data-push attribute (capture
    // phase, before the runtime's own listeners) and history.push().
    asserts.assertStringIncludes(UI_HISTORY, 'dataset.push !== undefined');
    asserts.assertStringIncludes(UI_HISTORY, '}, true);');
    asserts.assertStringIncludes(UI_HISTORY, 'push(url, target, opts)');
    // Entries are OURS only — marker-keyed state; foreign popstate is
    // left to the browser.
    asserts.assertStringIncludes(UI_HISTORY, '__rapidHistory');
    asserts.assertStringIncludes(UI_HISTORY, 'if (!entry) return;');
    // NO DOM cache: restore is a re-fetch via rapid.swap, with a full
    // navigation fallback when the region is gone or the swap fails.
    asserts.assertEquals(UI_HISTORY.includes('innerHTML'), false);
    asserts.assertStringIncludes(UI_HISTORY, 'window.rapid.swap(entry.url');
    asserts.assertStringIncludes(UI_HISTORY, 'location.assign(entry.url)');
    // A push needs a restore address — an id-less region refuses it.
    asserts.assertStringIncludes(UI_HISTORY, 'region.id');
    // Only GET swaps push — restoring a POST action URL would 405.
    asserts.assertStringIncludes(UI_HISTORY, "detail.method !== 'GET'");
    // The initial entry is stamped once, as a PAGE entry: back-to-start
    // is a full navigation, never the page fetched as a fragment into
    // the region (nested UI).
    asserts.assertStringIncludes(UI_HISTORY, 'history.replaceState');
    asserts.assertStringIncludes(UI_HISTORY, 'page: true');
    asserts.assertStringIncludes(UI_HISTORY, 'if (entry.page) {');
    // The page entry's url is a NAVIGATION target: hash preserved, and
    // restored via replace() (assign would push and truncate forward).
    asserts.assertStringIncludes(
      UI_HISTORY,
      'location.pathname + location.search + location.hash',
    );
    asserts.assertStringIncludes(UI_HISTORY, 'location.replace(entry.url)');
    // pushState can throw (cross-origin/invalid URL) — guarded, so a
    // refused address can't kill back navigation.
    asserts.assertStringIncludes(UI_HISTORY, 'pushState refused');
    // Title sync from the enriched rapid:swapped detail — pushed and
    // restored swaps only (a widget swap never retitles the tab).
    asserts.assertStringIncludes(UI_HISTORY, 'doc.title = detail.title');
    // Idempotent under a double load, like the live bridge.
    asserts.assertStringIncludes(
      UI_HISTORY,
      'if (window.rapid && window.rapid.history) return;',
    );
  });
});
