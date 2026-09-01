/**
 * @fileoverview The streaming response model end-to-end: a ReadableStream /
 * async-iterable body streams through serializeResponse (never buffered, no
 * content-length, cancelled on HEAD), SSE framing, file streams (whole + byte
 * range), the middleware rules (etag skips, compress pipes chunk-wise), a
 * module reply stream, and the HTTP-only guard on JOB/SOCKET.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  makeTempDir,
  readFileStream,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { Application } from '../Application.ts';
import { GET, Module } from '../decorators/mod.ts';
import { compress } from '../middlewares/compress.ts';
import { etag } from '../middlewares/etag.ts';
import type { RapidContextResponse } from '../types/mod.ts';
import { serializeResponse } from './serializeResponse.ts';
import {
  frameSseEvent,
  isStreamBody,
  sseStream,
  toReadableStream,
} from './streams.ts';

const text = (r: Response) => r.text();
async function* chunks(...parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}
const make = () =>
  Application.initialize({
    name: 'streams',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

describe('streaming response model', () => {
  it('isStreamBody recognises a ReadableStream and an async iterable, nothing else', () => {
    asserts.assert(isStreamBody(new ReadableStream()));
    asserts.assert(isStreamBody(chunks('a')));
    asserts.assertEquals(isStreamBody('s'), false);
    asserts.assertEquals(isStreamBody(new Uint8Array(1)), false);
    asserts.assertEquals(isStreamBody({ a: 1 }), false);
    asserts.assertEquals(isStreamBody(null), false);
  });

  it('serializeResponse streams an async iterable (strings encoded), no content-length', async () => {
    const headers = new Headers();
    const res = serializeResponse(chunks('hel', 'lo'), 200, headers);
    asserts.assertEquals(
      headers.get('content-type'),
      'application/octet-stream',
    );
    asserts.assertEquals(headers.has('content-length'), false);
    asserts.assertEquals(await text(res), 'hello');
  });

  it('a HEAD on a stream body sends no body and cancels (releases) the stream', async () => {
    let pulled = false;
    async function* src(): AsyncGenerator<string> {
      pulled = true;
      yield 'never-sent';
    }
    const stream = toReadableStream(src());
    const res = serializeResponse(stream, 200, new Headers(), true);
    asserts.assertEquals(res.body, null);
    await new Promise((r) => setTimeout(r, 0));
    // The source was never pulled (nothing read for a HEAD) and the stream is
    // cancelled — a further read rejects/closes instead of producing data.
    asserts.assertEquals(pulled, false);
    const { done } = await stream.getReader().read();
    asserts.assertEquals(done, true);
  });

  it('frames SSE events per spec (event/id/retry, multi-line data, JSON data)', () => {
    asserts.assertEquals(
      frameSseEvent({ event: 'tick', id: '7', retry: 500, data: 'a\nb' }),
      'event: tick\nid: 7\nretry: 500\ndata: a\ndata: b\n\n',
    );
    asserts.assertEquals(
      frameSseEvent({ data: { n: 1 } }),
      'data: {"n":1}\n\n',
    );
  });

  it('SSE: a bare CR cannot inject fields — data splits on \\r too; event/id strip EOL', () => {
    // EventSource treats a lone CR as end-of-line: unframed, this value
    // would smuggle its own `event:`/`data:` lines into the stream.
    asserts.assertEquals(
      frameSseEvent({ data: 'x\revent: fake\rdata: {"pwn":1}' }),
      'data: x\ndata: event: fake\ndata: data: {"pwn":1}\n\n',
    );
    asserts.assertEquals(
      frameSseEvent({ data: 'a\r\nb' }),
      'data: a\ndata: b\n\n',
    );
    asserts.assertEquals(
      frameSseEvent({ event: 'ti\nck', id: '7\r8', data: 'x' }),
      'event: tick\nid: 78\ndata: x\n\n',
    );
  });

  it('ctx.sse streams framed events with text/event-stream over app.fetch', async () => {
    const app = await make();
    app.get('/events', (ctx) =>
      ctx.sse((async function* () {
        yield { event: 'tick', data: { i: 0 } };
        yield { event: 'tick', data: { i: 1 } };
      })()));
    const res = await app.fetch(new Request('http://app/events'));
    asserts.assertEquals(res.headers.get('content-type'), 'text/event-stream');
    asserts.assertEquals(
      await text(res),
      'event: tick\ndata: {"i":0}\n\nevent: tick\ndata: {"i":1}\n\n',
    );
  });

  it('sseStream cancellation returns the generator so its finally runs', async () => {
    let cleaned = false;
    async function* src() {
      try {
        yield { data: 'x' };
        yield { data: 'y' };
      } finally {
        cleaned = true;
      }
    }
    const stream = sseStream(src());
    const reader = stream.getReader();
    await reader.read(); // first event
    await reader.cancel(); // client went away
    asserts.assertEquals(cleaned, true);
  });

  it('compat readFileStream (consumed by serve/server.static) streams a whole file and a byte range', async () => {
    const dir = await makeTempDir({ prefix: 'rapid-fs-' });
    try {
      await writeTextFile(`${dir}/f.txt`, '0123456789');
      asserts.assertEquals(
        await text(new Response(await readFileStream(`${dir}/f.txt`))),
        '0123456789',
      );
      asserts.assertEquals(
        await text(
          new Response(
            await readFileStream(`${dir}/f.txt`, { start: 2, end: 5 }),
          ),
        ),
        '2345',
      );
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('a module method may return a stream body', async () => {
    @Module('Streamer', {})
    class Streamer {
      @GET('/s')
      go(): RapidContextResponse {
        return { content: chunks('mod', 'ule') };
      }
    }
    const app = await make();
    app.module(new Streamer());
    asserts.assertEquals(
      await text(await app.fetch(new Request('http://app/s'))),
      'module',
    );
  });

  it('etag skips a stream body (no content hash without buffering)', async () => {
    const app = await make();
    app.use(etag());
    app.get('/s', () => ({ content: chunks('abc') }));
    const res = await app.fetch(new Request('http://app/s'));
    asserts.assertEquals(res.headers.get('etag'), null);
    asserts.assertEquals(await text(res), 'abc');
  });

  it('compress pipes a compressible stream body chunk-wise (gzip, no content-length)', async () => {
    const app = await make();
    app.use(compress());
    app.get('/s', () => ({
      content: chunks('x'.repeat(2000)),
      headers: { 'content-type': 'text/plain', 'content-length': '2000' },
    }));
    const res = await app.fetch(
      new Request('http://app/s', { headers: { 'accept-encoding': 'gzip' } }),
    );
    asserts.assertEquals(res.headers.get('content-encoding'), 'gzip');
    asserts.assertEquals(res.headers.get('content-length'), null);
    // Decompress to prove the bytes survived the pipe intact.
    const plain = await text(
      new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))),
    );
    asserts.assertEquals(plain, 'x'.repeat(2000));
  });

  it('rejects a stream body on a JOB (HTTP-only)', async () => {
    const app = await make();
    app.job('s', '* * * * *', () => ({ content: chunks('no') }));
    const out = await app.triggerJob('s');
    asserts.assertEquals(out.status, 500);
  });
});
