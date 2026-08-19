/**
 * @fileoverview secureHeaders — the default set, opt-ins (HSTS/CSP),
 * opt-outs, and error-path presence.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { secureHeaders, type SecureHeadersOptions } from './secureHeaders.ts';

const spin = async (options?: SecureHeadersOptions) => {
  const app = new Application({ name: 'sh', server: { port: 0 } });
  app.use(secureHeaders(options));
  app.get('/r', () => ({ content: 'ok' }));
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  await app.start();
  return { app, base: `http://localhost:${app.port}` };
};

describe('rapid.middlewares.secureHeaders', () => {
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
      hsts: { maxAge: 3600, preload: true },
      contentSecurityPolicy: "default-src 'none'",
      frameOptions: false,
      referrerPolicy: false,
    });
    try {
      const r = await fetch(`${base}/r`);
      await r.text();
      asserts.assertEquals(
        r.headers.get('strict-transport-security'),
        'max-age=3600; includeSubDomains; preload',
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
