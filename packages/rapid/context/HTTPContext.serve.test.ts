/**
 * @fileoverview HTTPContext.serve() / .html() — file + HTML responses.
 * @module
 */
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir, writeTextFile } from '@tundralibs/compat/file';
import { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import { HTTPContext } from './HTTPContext.ts';

const app = new Application({ name: 'serve-test', server: { port: 0 } });
const ctx = () =>
  new HTTPContext(app, {
    request: new Request('http://localhost/'),
    remoteAddress: '127.0.0.1',
  });

describe('rapid.HTTPContext.serve / .html', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'rapid-serve-' });
    await writeTextFile(`${dir}/page.html`, '<h1>Hi</h1>');
    await writeTextFile(`${dir}/data.json`, '{"a":1}');
  });
  afterAll(() => removeDir(dir, { recursive: true }));

  it('serve() reads the file with an extension-derived content-type', async () => {
    const res = await ctx().serve(`${dir}/page.html`);
    asserts.assertEquals(res.status, 200);
    asserts.assert(res.content instanceof Uint8Array);
    asserts.assertEquals(
      new TextDecoder().decode(res.content as Uint8Array),
      '<h1>Hi</h1>',
    );
    asserts.assertEquals(
      (res.headers as Record<string, string>)['content-type'],
      'text/html; charset=utf-8',
    );
  });

  it('serve() honors contentType override + download attachment', async () => {
    const res = await ctx().serve(`${dir}/data.json`, {
      contentType: 'application/x-thing',
      download: 'report.json',
    });
    const h = res.headers as Record<string, string>;
    asserts.assertEquals(h['content-type'], 'application/x-thing');
    asserts.assertEquals(
      h['content-disposition'],
      'attachment; filename="report.json"',
    );
  });

  it('serve() on a missing path throws RAPID_NOT_FOUND (→ 404)', async () => {
    await asserts.assertRejects(
      () => ctx().serve(`${dir}/nope.html`),
      RapidError,
      'Not found',
    );
  });

  it('html() sets text/html and the given status', () => {
    const res = ctx().html('<p>hi</p>', 201);
    asserts.assertEquals(res.status, 201);
    asserts.assertEquals(res.content, '<p>hi</p>');
    asserts.assertEquals(
      (res.headers as Record<string, string>)['content-type'],
      'text/html; charset=utf-8',
    );
  });
});
