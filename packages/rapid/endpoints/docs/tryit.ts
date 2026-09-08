/**
 * @fileoverview The try-it script the `rapid` docs viewer serves at
 * `/__rapid/docs.js` (rapid-owned, no CDN, `script-src 'self'` suffices).
 * It keeps the credential box's values in this tab's session storage,
 * applies them to the requests the per-operation forms fire — HTTP basic
 * and bearer, header and query API keys (a cookie key is the browser's
 * to send), OAuth / OIDC tokens as bearer — signs the user in through the
 * app's own login route, and exposes `rapid.docs.setCredential(name,
 * value)` so a custom credential box mixes with the default one. Requests
 * go to this origin only.
 *
 * @module
 */
import { scriptEtag } from '../../ui/ui.ts';

/** The served source. */
export const DOCS_TRYIT = `(() => {
  if (window.rapid && window.rapid.docs) return;
  const doc = document;
  const KEY = 'rapid.docs.credentials';
  const load = () => {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; }
    catch { return {}; }
  };
  const save = (all) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
  };
  const cfg = doc.body ? doc.body.dataset : {};
  const CSRF_COOKIE = cfg.csrfCookie || 'csrf';
  const CSRF_HEADER = cfg.csrfHeader || 'x-csrf-token';
  const cookie = (name) => {
    const m = doc.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  };

  // --- credentials -------------------------------------------------------
  const setCredential = (name, value) => {
    const all = load();
    if (value === undefined || value === null || value === '') delete all[name];
    else all[name] = value;
    save(all);
    reflect();
    doc.dispatchEvent(new CustomEvent('rapid:docs:credentials', { detail: { name } }));
  };
  const controls = () => doc.querySelectorAll('[data-docs-credential]');
  const reflect = () => {
    const all = load();
    for (const el of controls()) {
      const v = all[el.dataset.docsCredential];
      if (el.dataset.docsPart) {
        el.value = v && typeof v === 'object' ? (v[el.dataset.docsPart] || '') : '';
      } else if (typeof v === 'string') el.value = v;
    }
  };
  const readControl = (el) => {
    const name = el.dataset.docsCredential;
    if (el.dataset.docsPart) {
      const parts = {};
      for (const p of doc.querySelectorAll('[data-docs-credential="' + name + '"][data-docs-part]')) {
        parts[p.dataset.docsPart] = p.value;
      }
      setCredential(name, parts.user || parts.password ? parts : undefined);
    } else setCredential(name, el.value);
  };
  doc.addEventListener('change', (e) => {
    if (e.target instanceof Element && e.target.matches('[data-docs-credential]')) readControl(e.target);
  });

  // The scheme metadata of every declared credential, from its control.
  const schemeOf = (name) => {
    const el = doc.querySelector('[data-docs-credential="' + name + '"]');
    return el ? el.dataset : undefined;
  };
  const apply = (headers, url, names) => {
    const all = load();
    for (const name of names) {
      const value = all[name];
      const meta = schemeOf(name);
      if (value === undefined || !meta) continue;
      if (meta.docsType === 'apiKey') {
        if (meta.docsIn === 'header') headers.set(meta.docsName, value);
        else if (meta.docsIn === 'query') url.searchParams.set(meta.docsName, value);
        // a cookie key: the browser sends it
      } else if (meta.docsType === 'http' && meta.docsScheme === 'basic') {
        if (value && typeof value === 'object') {
          headers.set('authorization', 'Basic ' + btoa((value.user || '') + ':' + (value.password || '')));
        }
      } else if (typeof value === 'string') {
        const scheme = meta.docsScheme && meta.docsScheme !== 'basic' ? meta.docsScheme : 'bearer';
        headers.set('authorization', scheme.charAt(0).toUpperCase() + scheme.slice(1) + ' ' + value);
      }
    }
  };

  // --- sign-in through the app's own login route --------------------------
  doc.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.docsLogin) return;
    e.preventDefault();
    const [idField, pwField] = (form.dataset.docsLoginFields || 'identifier,password').split(',');
    const status = form.querySelector('[data-docs-login-status]');
    const body = {};
    body[idField] = form.elements[idField].value;
    body[pwField] = form.elements[pwField].value;
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
    const token = cookie(CSRF_COOKIE);
    if (token) headers.set(CSRF_HEADER, token);
    try {
      const res = await fetch(new URL(form.dataset.docsLogin, location.href), {
        method: 'POST', headers, body: JSON.stringify(body), credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (status) status.textContent = 'sign-in failed (' + res.status + ')';
        return;
      }
      // The token fills every bearer-shaped credential; a session cookie the
      // reply set travels on its own.
      if (typeof data.token === 'string') {
        for (const el of controls()) {
          const d = el.dataset;
          if (d.docsType === 'http' && d.docsScheme !== 'basic') setCredential(d.docsCredential, data.token);
          if (d.docsType === 'oauth2' || d.docsType === 'openIdConnect') setCredential(d.docsCredential, data.token);
        }
      }
      if (status) status.textContent = 'signed in';
    } catch (error) {
      if (status) status.textContent = String(error);
    }
  });

  // --- try it --------------------------------------------------------------
  doc.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-docs-try')) return;
    e.preventDefault();
    const out = form.querySelector('[data-docs-result]');
    let path = form.dataset.path || '/';
    const url = new URL(location.origin);
    const headers = new Headers({ accept: 'application/json' });
    for (const input of form.querySelectorAll('[data-docs-param]')) {
      const name = input.dataset.docsParam;
      const value = input.value;
      if (input.dataset.docsIn === 'path') path = path.replace('{' + name + '}', encodeURIComponent(value));
      else if (input.dataset.docsIn === 'query' && value !== '') url.searchParams.set(name, value);
      else if (input.dataset.docsIn === 'header' && value !== '') headers.set(name, value);
    }
    url.pathname = path;
    const names = (form.dataset.security || '').split(',').filter(Boolean);
    apply(headers, url, names.length ? names : Object.keys(load()));
    const csrf = cookie(CSRF_COOKIE);
    if (csrf) headers.set(CSRF_HEADER, csrf);
    const bodyEl = form.querySelector('[data-docs-body]');
    const init = { method: form.dataset.method || 'GET', headers, credentials: 'same-origin' };
    if (bodyEl && init.method !== 'GET' && init.method !== 'HEAD') {
      headers.set('content-type', 'application/json');
      init.body = bodyEl.value;
    }
    if (out) { out.hidden = false; out.textContent = '…'; }
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let shown = text;
      try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      const lines = [init.method + ' ' + url.pathname + url.search + ' → ' + res.status];
      res.headers.forEach((v, k) => lines.push(k + ': ' + v));
      if (out) out.textContent = lines.join('\\n') + '\\n\\n' + shown;
    } catch (error) {
      if (out) out.textContent = String(error);
    }
  });

  reflect();
  window.rapid = Object.freeze(Object.assign({}, window.rapid, {
    docs: Object.freeze({ setCredential, credentials: load }),
  }));
})();
`;

/** Strong content ETag for the served script. */
export const DOCS_TRYIT_ETAG: string = scriptEtag('rapid-docs', DOCS_TRYIT);

/** The one-line Swagger UI initialiser (reads the spec URL off `#swagger-ui`). */
export const DOCS_SWAGGER_INIT = `(() => {
  const el = document.getElementById('swagger-ui');
  if (!el || !window.SwaggerUIBundle) return;
  window.SwaggerUIBundle({ url: el.dataset.url, dom_id: '#swagger-ui' });
})();
`;

/** Strong content ETag for the Swagger initialiser. */
export const DOCS_SWAGGER_INIT_ETAG: string = scriptEtag(
  'rapid-docs-swagger',
  DOCS_SWAGGER_INIT,
);
