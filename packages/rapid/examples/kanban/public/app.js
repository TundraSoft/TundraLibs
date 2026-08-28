/**
 * Flightdeck's dynamic-update wiring — the whole "rich app" story is
 * three listeners over the framework's two client scripts:
 *
 *   1. rapid:swapped chains — ONE user action, MANY regions: a board
 *      swap refreshes the stats rail; a composer swap refreshes board
 *      AND stats. `rapid.refresh()` re-fetches a region's last GET
 *      fragment, so this file carries no URLs for them.
 *   2. rapid:push — the live channel: every store mutation (any tab,
 *      the bot included) toasts and freshens board + activity here.
 *   3. rapid:live — the LIVE badge mirrors the socket state.
 */
(() => {
  const $ = (s) => document.querySelector(s);

  // refresh() knows a region's source only after its FIRST swap — on a
  // freshly loaded page, fall back to an explicit fragment fetch.
  const freshen = async (sel, url, swap) => {
    if (!(await rapid.refresh(sel))) rapid.swap(url, sel, swap ? { swap } : {});
  };
  const board = () => freshen('#board', '/board' + location.search, 'outer');
  const stats = () => freshen('#stats', '/board/stats');
  const activity = () => freshen('#activity', '/board/activity');

  document.addEventListener('rapid:swapped', (e) => {
    if (e.target.id === 'board') stats();
    if (e.target.id === 'composer') {
      board();
      stats();
    }
  });

  let toastTimer;
  const toast = (text) => {
    const t = $('#toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  };

  rapid.live.connect('board');
  document.addEventListener('rapid:push', (e) => {
    if (e.detail.channel !== 'board') return;
    toast('⚡ ' + (e.detail.data.text || 'Board updated'));
    board();
    activity();
  });

  document.addEventListener('rapid:live', (e) => {
    const live = $('#live');
    if (live) live.classList.toggle('on', e.detail.connected);
  });
})();
