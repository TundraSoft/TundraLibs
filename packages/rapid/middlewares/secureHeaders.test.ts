/**
 * @fileoverview secureHeaders — the default set, opt-ins (HSTS/CSP),
 * opt-outs, and error-path presence.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { secureHeaders, type SecureHeadersOptions } from './secureHeaders.ts';
import { RapidError } from '../errors/mod.ts';

const spin = async (options?: SecureHeadersOptions) => {
  const app = await Application.initialize({ name: 'sh', server: { port: 0 } });
  app.use(secureHeaders(options));
  app.get('/r', () => ({ content: 'ok' }));
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  await app.start();
  return { app, base: `http://localhost:${app.port}` };
};

describe('rapid.middlewares.secureHeaders', () => {
  it('rejects a value that would ship a malformed or ignored header, at build', () => {
    const cases: [SecureHeadersOptions, string][] = [
      [{ frameOptions: 'ALLOW-FROM https://x' as never }, 'frameOptions'],
      [{ referrerPolicy: 'never' }, 'Referrer Policy tokens'],
      [{ referrerPolicy: 'no-referrer, later' }, 'Referrer Policy tokens'],
      [{ hsts: { maxAge: -1 } }, 'hsts.maxAge'],
      [{ hsts: { maxAge: 1.5 } }, 'hsts.maxAge'],
      [{ hsts: { preload: true } }, 'one year'],
      [{
        hsts: { maxAge: 31_536_000, preload: true, includeSubDomains: false },
      }, 'includeSubDomains'],
      [{ contentSecurityPolicy: '' }, 'contentSecurityPolicy'],
      [
        { contentSecurityPolicy: "default-src 'self'\nx: y" },
        'contentSecurityPolicy',
      ],
      [
        { crossOriginOpenerPolicy: 'strict' as never },
        'crossOriginOpenerPolicy',
      ],
      [
        { crossOriginResourcePolicy: 'none' as never },
        'crossOriginResourcePolicy',
      ],
      [{ dnsPrefetchControl: true as never }, 'dnsPrefetchControl'],
      [{ permissionsPolicy: {} }, 'at least one feature'],
      [{ permissionsPolicy: { 'Camera': [] } }, 'not a valid feature name'],
      [
        { permissionsPolicy: { camera: ['example.com'] } },
        "'self', '*', or a serialized origin",
      ],
      [{ permissionsPolicy: '' }, 'permissionsPolicy'],
    ];
    for (const [options, message] of cases) {
      asserts.assertThrows(() => secureHeaders(options), RapidError, message);
    }
    secureHeaders({
      referrerPolicy: 'no-referrer, strict-origin-when-cross-origin',
      hsts: { maxAge: 31_536_000, preload: true },
      contentSecurityPolicy: "default-src 'self'",
    });
    secureHeaders({ hsts: { maxAge: 0 } });
    secureHeaders({
      permissionsPolicy: {
        camera: [],
        geolocation: ['self', 'https://x.example'],
      },
    });
  });

  it('ships the modern default set, and the document-only policies on the ui surface alone', async () => {
    const app = await Application.initialize({
      name: 'sh-surface',
      server: { port: 0, api: { prefix: '/api' } },
    });
    app.use(secureHeaders({
      permissionsPolicy: {
        camera: [],
        geolocation: ['self', 'https://x.example'],
        fullscreen: ['*'],
      },
    }));
    app.get('/r', () => ({ content: 'ok' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      const ui = await fetch(`${base}/r`);
      await ui.text();
      const api = await fetch(`${base}/api/r`);
      await api.text();
      for (const r of [ui, api]) {
        asserts.assertEquals(
          r.headers.get('cross-origin-resource-policy'),
          'same-origin',
        );
        asserts.assertEquals(
          r.headers.get('x-permitted-cross-domain-policies'),
          'none',
        );
        asserts.assertEquals(r.headers.get('x-dns-prefetch-control'), 'off');
        asserts.assertEquals(r.headers.get('x-xss-protection'), '0');
        asserts.assertEquals(
          r.headers.get('permissions-policy'),
          'camera=(), geolocation=(self "https://x.example"), fullscreen=*',
        );
      }
      asserts.assertEquals(
        ui.headers.get('cross-origin-opener-policy'),
        'same-origin',
      );
      asserts.assertEquals(ui.headers.get('origin-agent-cluster'), '?1');
      asserts.assertEquals(
        ui.headers.get('cross-origin-embedder-policy'),
        null,
      ); // opt-in
      asserts.assertEquals(api.headers.get('cross-origin-opener-policy'), null);
      asserts.assertEquals(api.headers.get('origin-agent-cluster'), null);
    } finally {
      await app.stop();
    }
  });

  it('defaults: nosniff + DENY + no-referrer; HSTS/CSP absent', async () => {
    const { app, base } = await spin();
    try {
      const r = await fetch(`${base}/r`);
      await r.text();
      asserts.assertEquals(r.headers.get('x-content-type-options'), 'nosniff');
      asserts.assertEquals(r.headers.get('x-frame-options'), 'DENY');
      asserts.assertEquals(r.headers.get('referrer-policy'), 'no-referrer');
      asserts.assertEquals(r.headers.get('strict-transport-security'), null);
      asserts.assertEquals(r.headers.get('content-security-policy'), null);
    } finally {
      await app.stop();
    }
  });

  it('HSTS/CSP opt in; frame/referrer opt out', async () => {
    const { app, base } = await spin({
      hsts: { maxAge: 31_536_000, preload: true },
      contentSecurityPolicy: "default-src 'none'",
      frameOptions: false,
      referrerPolicy: false,
    });
    try {
      const r = await fetch(`${base}/r`);
      await r.text();
      asserts.assertEquals(
        r.headers.get('strict-transport-security'),
        'max-age=31536000; includeSubDomains; preload',
      );
      asserts.assertEquals(
        r.headers.get('content-security-policy'),
        "default-src 'none'",
      );
      asserts.assertEquals(r.headers.get('x-frame-options'), null);
      asserts.assertEquals(r.headers.get('referrer-policy'), null);
    } finally {
      await app.stop();
    }
  });

  it('hardening is present on ERROR responses too', async () => {
    const { app, base } = await spin();
    try {
      const r = await fetch(`${base}/boom`);
      await r.text();
      asserts.assertEquals(r.status, 500);
      asserts.assertEquals(r.headers.get('x-content-type-options'), 'nosniff');
    } finally {
      await app.stop();
    }
  });
});
