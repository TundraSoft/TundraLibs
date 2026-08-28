/**
 * The blog page's own script — the whole live story is now three
 * listeners over the framework's two client scripts: the swap runtime
 * (`rapid.swap`, `rapid:swapped`) and the live bridge
 * (`rapid.live.connect`, `rapid:push`, `rapid:live`). Compare with the
 * previous revision, which hand-rolled the websocket subscribe/
 * reconnect loop this file no longer contains.
 */
(() => {
  const $ = (s) => document.querySelector(s);

  // Chained fragments: when the detail pane swaps in, load that post's
  // comments fragment into its slot.
  document.addEventListener('rapid:swapped', (e) => {
    if (e.target.id !== 'post-detail') return;
    const slot = e.target.querySelector('#comments');
    if (slot) rapid.swap('/posts/' + slot.dataset.post + '/comments', slot);
  });

  let toastTimer;
  const toast = (text) => {
    const t = $('#toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  };

  // The live channel: every broadcast toasts; when it concerns the open
  // post, refresh its comments fragment in place.
  rapid.live.connect('comments');
  document.addEventListener('rapid:push', (e) => {
    if (e.detail.channel !== 'comments') return;
    const data = e.detail.data || {};
    toast(
      '💬 ' + (data.author || 'Someone') + ' commented on “' +
        (data.postTitle || 'a post') + '”',
    );
    const slot = $('#comments');
    if (slot && slot.dataset.post === data.postId) {
      rapid.swap('/posts/' + data.postId + '/comments', slot);
    }
  });

  // The LIVE badge mirrors the socket state (reconnects are the
  // bridge's job — capped backoff built in).
  document.addEventListener('rapid:live', (e) => {
    const live = $('#live');
    if (live) live.classList.toggle('on', e.detail.connected);
  });
})();
