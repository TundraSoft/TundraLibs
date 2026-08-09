/**
 * Conformance against a REAL OTLP collector.
 *
 * The fixture tests in `encode.test.ts` prove the encoder matches what we
 * believe the spec says. This one proves a real collector agrees — a
 * self-agreeing encoder can still be wrong, and a collector that rejects a
 * payload does so silently from the application's point of view, so the spans
 * simply never appear.
 *
 * Runs against the `otel-collector` service in CI and SKIPS when no collector
 * is reachable, so a contributor without one still gets a green suite. Same
 * pattern the drivers live-database suites use.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { getEnv } from '@tundralibs/compat/runtime';
import { encodeSpans, OTLPExporter } from './mod.ts';
import { SpanKind, SpanStatusCode } from '../../types/mod.ts';
import type { SpanData } from '../../types/mod.ts';

const ENDPOINT = getEnv()['OTLP_ENDPOINT'] ?? 'http://localhost:4318';
const TRACES_URL = `${ENDPOINT}/v1/traces`;

/** Whether a collector is reachable — decides whether this suite runs at all. */
const collectorAvailable = await (async (): Promise<boolean> => {
  try {
    const res = await fetch(TRACES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
      signal: AbortSignal.timeout(2000),
    });
    // Any HTTP answer means something is listening and speaking OTLP.
    return res.status > 0;
  } catch {
    return false;
  }
})();

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
  attributes: {
    'http.request.method': 'GET',
    'http.response.status_code': 200,
  },
  events: [],
  status: { code: SpanStatusCode.UNSET },
  resource: { 'service.name': 'tracer-conformance' },
  ...overrides,
});

/** POST a raw body and return the status — used for the negative controls. */
const postRaw = async (body: unknown): Promise<number> => {
  const res = await fetch(TRACES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await res.body?.cancel();
  return res.status;
};

describe({
  name: 'tracer.otlp.collector',
  ignore: !collectorAvailable,
  fn: () => {
    it('a real collector accepts what the exporter produces', async () => {
      const errors: unknown[] = [];
      const exporter = new OTLPExporter({
        baseURL: ENDPOINT,
        onExportError: (e) => errors.push(e),
      });
      await exporter.export([spanData()]);
      // The exporter reports rejections rather than throwing, so an empty
      // error list is the assertion that the collector took the batch.
      asserts.assertEquals(errors, []);
    });

    it('accepts a batch of many spans, including a parented child', async () => {
      const errors: unknown[] = [];
      const exporter = new OTLPExporter({
        baseURL: ENDPOINT,
        onExportError: (e) => errors.push(e),
      });
      await exporter.export([
        spanData(),
        spanData({ name: 'db.query', parentSpanId: '00f067aa0ba902b7' }),
        spanData({
          name: 'failed',
          status: { code: SpanStatusCode.ERROR, message: 'boom' },
          events: [{
            name: 'exception',
            time: new Date(1_700_000_000_050),
            attributes: { 'exception.type': 'TypeError' },
          }],
        }),
      ]);
      asserts.assertEquals(errors, []);
    });

    it('accepts spans carrying every attribute value type', async () => {
      const errors: unknown[] = [];
      const exporter = new OTLPExporter({
        baseURL: ENDPOINT,
        onExportError: (e) => errors.push(e),
      });
      await exporter.export([
        spanData({
          attributes: {
            str: 'x',
            int: 42,
            float: 1.5,
            bool: true,
            strs: ['a', 'b'],
            ints: [1, 2],
          },
        }),
      ]);
      asserts.assertEquals(errors, []);
    });

    // --- negative controls -------------------------------------------------
    // Without these, a passing suite would be ambiguous: it could mean "our
    // encoding is correct" OR "this collector accepts anything". These pin
    // that the collector genuinely discriminates.

    it('rejects base64 ids — proving the hex encoding is load-bearing', async () => {
      const payload = encodeSpans([spanData()]);
      payload.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.traceId = btoa(
        '0123456789abcdef',
      );
      asserts.assertEquals(await postRaw(payload), 400);
    });

    it('rejects bare attribute values — proving the AnyValue wrapper is load-bearing', async () => {
      const payload = JSON.parse(
        JSON.stringify(encodeSpans([spanData()])),
      ) as Record<string, never>;
      // deno-lint-ignore no-explicit-any
      (payload as any).resourceSpans[0].scopeSpans[0].spans[0].attributes = [
        { key: 'a', value: 'plain-string-instead-of-AnyValue' },
      ];
      asserts.assertEquals(await postRaw(payload), 400);
    });

    // NOTE: a numeric `*TimeUnixNano` is deliberately NOT checked here. The
    // collector accepts int64 as either a JSON number or a string (verified:
    // it answers 200), so it cannot catch that mistake — even though emitting
    // a number loses precision beyond 2^53. That assertion lives in
    // `encode.test.ts` instead. This suite complements the fixtures; it does
    // not replace them.
  },
});
