/**
 * @fileoverview fingerprintAssets — the boot-time asset map: recursive,
 * URL-keyed, content-keyed — plus `view.asset()` end to end.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  ensureDir,
  makeTempDir,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { Application } from '../Application.ts';
import { fingerprintAssets } from './assets.ts';
import { html, template } from './html.ts';

describe('rapid.ui.fingerprintAssets', () => {
  let base = '';

  beforeAll(async () => {
    base = await makeTempDir({ prefix: 'rapid-assets-' });
    await ensureDir(`${base}/css`);
    await writeTextFile(`${base}/app.js`, 'console.log(1)');
    await writeTextFile(`${base}/css/site.css`, 'body{margin:0}');
    await writeTextFile(`${base}/css/twin.css`, 'body{margin:0}'); // same bytes
  });
  afterAll(async () => {
    await removeDir(base, { recursive: true });
  });

  it('maps every file recursively under /-separated, prefixed URL keys', async () => {
    const assets = await fingerprintAssets(base, { prefix: '/static' });
    asserts.assertEquals(
      Object.keys(assets).sort(),
      ['/static/app.js', '/static/css/site.css', '/static/css/twin.css'],
    );
  });

  it('versions are content-keyed: same bytes → same hash, changed bytes → a new hash', async () => {
    const before = await fingerprintAssets(base);
    asserts.assertEquals(before['/css/site.css'], before['/css/twin.css']);
    asserts.assertNotEquals(before['/app.js'], before['/css/site.css']);

    await writeTextFile(`${base}/app.js`, 'console.log(2)');
    const after = await fingerprintAssets(base);
    asserts.assertNotEquals(after['/app.js'], before['/app.js']);
    asserts.assertEquals(after['/css/site.css'], before['/css/site.css']);
  });

  it('a missing root rejects loudly', async () => {
    await asserts.assertRejects(() => fingerprintAssets(`${base}/no-such-dir`));
  });

  it('view.asset() versions a mapped path and passes an unmapped one through', async () => {
    const assets = await fingerprintAssets(base);
    const app = await Application.initialize({
      name: 'assets-view',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    app.ui({ assets });
    const Page = template<Record<never, never>>((_, view) =>
      html`<link href="${view.asset('/css/site.css')}"><img src="${
        view.asset('/unmapped.png')
      }">`
    );
    app.get('/p', { template: Page }, () => ({ content: {} }));
    const res = await app.fetch(
      new Request('http://app/p', { headers: { 'rapid-swap': '1' } }),
    );
    asserts.assertEquals(
      await res.text(),
      `<link href="/css/site.css?v=${
        assets['/css/site.css']
      }"><img src="/unmapped.png">`,
    );
    await app.stop();
  });

  it('app.ui() rejects an assets key without a leading slash', async () => {
    const app = await Application.initialize({
      name: 'assets-bad',
      server: { port: 0, hostname: '127.0.0.1' },
      logger: { handlers: [] },
    });
    asserts.assertThrows(
      () => app.ui({ assets: { 'style.css': 'abc' } }),
      Error,
      "assets keys must start with '/'",
    );
    await app.stop();
  });
});
