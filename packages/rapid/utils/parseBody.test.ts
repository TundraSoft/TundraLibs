/**
 * @fileoverview parseBody — the request-body engine, tested directly
 * (no live server): the byte cap, JSON/text/form dispatch, malformed
 * JSON, and repeated-field normalisation.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { makeTempDirSync, readDir } from '@tundralibs/compat/file';
import { parseBody } from './parseBody.ts';
import { RapidError } from '../errors/mod.ts';

const opts = (maxBodySize = 1_048_576) => ({
  maxBodySize,
  uploads: {
    maxSize: 10_485_760,
    allowedExtensions: [],
    path: makeTempDirSync({ prefix: 'pb-' }),
  },
});

const req = (body: BodyInit | null, type?: string) => {
  // A string body auto-sets content-type: text/plain — to exercise the
  // genuinely-headerless path, send raw bytes when no type is given.
  const payload = type === undefined && typeof body === 'string'
    ? new TextEncoder().encode(body)
    : body;
  return new Request('http://x/', {
    method: 'POST',
    headers: type ? { 'content-type': type } : {},
    body: payload,
    // deno-lint-ignore no-explicit-any
    ...(payload instanceof ReadableStream ? { duplex: 'half' } as any : {}),
  });
};

describe('rapid.parseBody', () => {
  it('parses JSON', async () => {
    const { value } = await parseBody(
      req('{"a":1}', 'application/json'),
      opts(),
    );
    asserts.assertEquals(value, { a: 1 });
  });

  it('empty JSON body → {}', async () => {
    const { value } = await parseBody(req('', 'application/json'), opts());
    asserts.assertEquals(value, {});
  });

  it('a non-object top-level JSON value (array/number/boolean/null) passes through, typed correctly', async () => {
    // RapidHTTPRequestBody used to claim Record<string,unknown> | string
    // | undefined — every one of these is legal JSON per RFC 8259 and
    // parseBody returns each verbatim (JSON.parse's return type is
    // `any`, so nothing caught the mismatch at the call site). Widened
    // to match reality rather than rejecting these at parse time — no
    // observed consumer assumed Record-shaped payload, and rejecting
    // would be a behavior change, not a type-accuracy fix.
    const cases: [string, unknown][] = [
      ['[1,2,3]', [1, 2, 3]],
      ['42', 42],
      ['true', true],
      ['null', null],
    ];
    for (const [body, expected] of cases) {
      const { value } = await parseBody(
        req(body, 'application/json'),
        opts(),
      );
      asserts.assertEquals(value, expected);
    }
  });

  it('malformed JSON → RAPID_VALIDATION_FAILED (client error)', async () => {
    await asserts.assertRejects(
      () => parseBody(req('{bad', 'application/json'), opts()),
      RapidError,
      'not valid JSON',
    );
  });

  it('text/* stays a string', async () => {
    const { value } = await parseBody(req('hello', 'text/plain'), opts());
    asserts.assertEquals(value, 'hello');
  });

  it('no content-type: opportunistic JSON, else text', async () => {
    asserts.assertEquals((await parseBody(req('{"a":2}'), opts())).value, {
      a: 2,
    });
    asserts.assertEquals((await parseBody(req('nope'), opts())).value, 'nope');
  });

  it('urlencoded form parses to fields', async () => {
    const { value } = await parseBody(
      req('a=1&b=2', 'application/x-www-form-urlencoded'),
      opts(),
    );
    asserts.assertEquals(value, { a: '1', b: '2' });
  });

  it('repeated form field normalises to an array (no loss)', async () => {
    const { value } = await parseBody(
      req('x=1&x=2&x=3', 'application/x-www-form-urlencoded'),
      opts(),
    );
    asserts.assertEquals(value, { x: ['1', '2', '3'] });
  });

  it('byte cap enforced on a chunked body (no content-length)', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 8; i++) c.enqueue(new Uint8Array(256 * 1024));
        c.close();
      },
    });
    await asserts.assertRejects(
      () => parseBody(req(stream, 'text/plain'), opts(1_048_576)),
      RapidError,
      'Payload too large',
    );
  });

  it('returns no files for a bodiless parse', async () => {
    const { files } = await parseBody(req('{}', 'application/json'), opts());
    asserts.assertEquals(files, []);
  });
  it('multipart file with no upload path (Workers/browser) → RAPID_UPLOADS_UNAVAILABLE, not a TypeError', async () => {
    const form = new FormData();
    form.append('doc', new File(['hello'], 'a.txt', { type: 'text/plain' }));
    const noFs = {
      maxBodySize: 1_048_576,
      uploads: {
        maxSize: 10_485_760,
        allowedExtensions: ['.txt'],
        path: undefined,
      },
    };
    const err = await asserts.assertRejects(
      () =>
        parseBody(
          new Request('http://x/', { method: 'POST', body: form }),
          noFs,
        ),
      RapidError,
    );
    asserts.assertEquals(err.code, 'RAPID_UPLOADS_UNAVAILABLE');
    asserts.assertEquals(err.status, 501);
  });

  it('a TEXT-ONLY multipart form still parses with no upload path — only files need disk', async () => {
    const form = new FormData();
    form.append('title', 'hi');
    form.append('tag', 'a');
    form.append('tag', 'b');
    const { value, files } = await parseBody(
      new Request('http://x/', { method: 'POST', body: form }),
      {
        maxBodySize: 1_048_576,
        uploads: {
          maxSize: 10_485_760,
          allowedExtensions: [],
          path: undefined,
        },
      },
    );
    asserts.assertEquals(value, { title: 'hi', tag: ['a', 'b'] });
    asserts.assertEquals(files, []);
  });

  it('cleans up already-written files when a LATER multipart part is rejected', async () => {
    const uploadDir = makeTempDirSync({ prefix: 'pb-leak-' });
    const form = new FormData();
    // First part is accepted and WRITTEN to disk; the second fails the
    // extension gauntlet, so parseBody throws — the first file must be
    // cleaned up, not stranded (repeatable → disk-fill DoS).
    form.append('good', new File(['hello world'], 'good.txt'));
    form.append('bad', new File(['x'], 'evil.exe'));
    const cfg = {
      maxBodySize: 1_048_576,
      uploads: {
        maxSize: 10_485_760,
        allowedExtensions: ['.txt'],
        path: uploadDir,
      },
    };
    await asserts.assertRejects(
      () =>
        parseBody(
          new Request('http://x/', { method: 'POST', body: form }),
          cfg,
        ),
      RapidError,
      'not allowed',
    );
    const left: string[] = [];
    for await (const entry of readDir(uploadDir)) left.push(entry.name);
    asserts.assertEquals(left, [], 'a rejected upload left an orphaned file');
  });
});
