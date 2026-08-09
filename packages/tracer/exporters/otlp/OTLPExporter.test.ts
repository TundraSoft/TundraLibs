import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { OTLPExporter } from './mod.ts';
import { SpanKind, SpanStatusCode } from '../../types/mod.ts';
import type { SpanData } from '../../types/mod.ts';

const spanData = (overrides: Partial<SpanData> = {}): SpanData => ({
  name: 'GET /orders',
  context: {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: 1,
  },
  kind: SpanKind.SERVER,
  startTime: new Date(1_700_000_000_000),
  endTime: new Date(1_700_000_000_120),
  attributes: {},
  events: [],
  status: { code: SpanStatusCode.UNSET },
  resource: { 'service.name': 'orders' },
  ...overrides,
});

type Capture = { url: string; init: RequestInit | undefined };

/**
 * Exporter with `_fetch` stubbed. RESTler exposes it as a protected seam, so
 * the whole request path is exercised — endpoint resolution, headers, JSON
 * body, response handling — with no network and no collector.
 */
class TestExporter extends OTLPExporter {
  public readonly calls: Capture[] = [];
  public status = 200;
  public failWith: Error | undefined;

  public override async export(spans: SpanData[]): Promise<void> {
    // deno-lint-ignore no-explicit-any
    (this as any)._fetch = (url: string | URL, init?: RequestInit) => {
      this.calls.push({ url: String(url), init });
      if (this.failWith) return Promise.reject(this.failWith);
      return Promise.resolve(
        new Response(JSON.stringify({ partialSuccess: {} }), {
          status: this.status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    await super.export(spans);
  }

  /** The parsed body of the last request. */
  public lastBody(): Record<string, unknown> {
    const body = this.calls.at(-1)?.init?.body;
    return JSON.parse(String(body)) as Record<string, unknown>;
  }
}

describe('tracer.otlp.OTLPExporter', () => {
  it('POSTs to <baseURL>/v1/traces', async () => {
    const e = new TestExporter({ baseURL: 'http://collector:4318' });
    await e.export([spanData()]);
    asserts.assertEquals(e.calls.length, 1);
    asserts.assertStringIncludes(e.calls[0]!.url, '/v1/traces');
    asserts.assertEquals(e.calls[0]!.init?.method, 'POST');
  });

  it('honours a custom tracesPath', async () => {
    const e = new TestExporter({
      baseURL: 'http://collector:4318',
      tracesPath: '/otlp/v1/traces',
    });
    await e.export([spanData()]);
    asserts.assertStringIncludes(e.calls[0]!.url, '/otlp/v1/traces');
  });

  it('sends the OTLP envelope as the JSON body', async () => {
    const e = new TestExporter({ baseURL: 'http://collector:4318' });
    await e.export([spanData()]);
    const body = e.lastBody() as {
      resourceSpans: Array<{ scopeSpans: Array<{ spans: unknown[] }> }>;
    };
    asserts.assertEquals(body.resourceSpans.length, 1);
    asserts.assertEquals(body.resourceSpans[0]!.scopeSpans[0]!.spans.length, 1);
  });

  it('passes custom headers through (auth for hosted backends)', async () => {
    const e = new TestExporter({
      baseURL: 'http://collector:4318',
      headers: { 'x-api-key': 'secret' },
    });
    await e.export([spanData()]);
    const headers = new Headers(e.calls[0]!.init?.headers);
    asserts.assertEquals(headers.get('x-api-key'), 'secret');
  });

  it('reports a non-2xx response instead of throwing', async () => {
    const errors: unknown[] = [];
    const e = new TestExporter({
      baseURL: 'http://collector:4318',
      onExportError: (err) => errors.push(err),
    });
    e.status = 429;
    await e.export([spanData()]); // must not reject
    asserts.assertEquals(errors.length, 1);
    asserts.assertStringIncludes(String(errors[0]), '429');
  });

  it('reports a transport failure instead of throwing', async () => {
    const errors: unknown[] = [];
    const e = new TestExporter({
      baseURL: 'http://collector:4318',
      onExportError: (err) => errors.push(err),
    });
    e.failWith = new Error('ECONNREFUSED');
    await e.export([spanData()]); // must not reject
    asserts.assert(errors.length >= 1);
  });

  it('stays silent when no error handler is supplied', async () => {
    const e = new TestExporter({ baseURL: 'http://collector:4318' });
    e.status = 500;
    await e.export([spanData()]); // must not reject or throw
  });

  it('reports an unencodable span and skips the request entirely', async () => {
    const errors: unknown[] = [];
    const e = new TestExporter({
      baseURL: 'http://collector:4318',
      onExportError: (err) => errors.push(err),
    });
    await e.export([
      spanData({
        context: { traceId: 'NOT-HEX', spanId: 'bad', traceFlags: 1 },
      }),
    ]);
    asserts.assertEquals(errors.length, 1);
    // Nothing encodable — no point contacting the collector.
    asserts.assertEquals(e.calls.length, 0);
  });

  it('shutdown resolves (nothing to release)', async () => {
    const e = new TestExporter({ baseURL: 'http://collector:4318' });
    await e.shutdown();
  });

  it('rejects an invalid baseURL at construction', () => {
    asserts.assertThrows(() => new OTLPExporter({ baseURL: 'not-a-url' }));
  });
});
