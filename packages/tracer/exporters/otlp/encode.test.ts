import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { encodeSpans, toAnyValue, toKeyValues } from './mod.ts';
import { SpanKind, SpanStatusCode } from '../../types/mod.ts';
import type { SpanData } from '../../types/mod.ts';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';

const spanData = (overrides: Partial<SpanData> = {}): SpanData => ({
  name: 'GET /orders',
  context: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
  kind: SpanKind.SERVER,
  startTime: new Date(1_700_000_000_000),
  endTime: new Date(1_700_000_000_120),
  attributes: {},
  events: [],
  status: { code: SpanStatusCode.UNSET },
  resource: { 'service.name': 'orders' },
  ...overrides,
});

/** The single span in an encoded batch, for concise assertions. */
const oneSpan = (spans: SpanData[]) =>
  encodeSpans(spans).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;

describe('tracer.otlp.encode', () => {
  describe('spec conformance — the encodings that silently break ingest', () => {
    it('emits ids as lowercase hex, NOT base64', () => {
      const s = oneSpan([spanData()]);
      asserts.assertEquals(s.traceId, TRACE_ID);
      asserts.assertEquals(s.spanId, SPAN_ID);
      // A base64 encoding would contain non-hex characters.
      asserts.assertMatch(s.traceId, /^[0-9a-f]{32}$/);
      asserts.assertMatch(s.spanId, /^[0-9a-f]{16}$/);
    });

    it('emits timestamps as decimal STRINGS of nanoseconds', () => {
      const s = oneSpan([spanData()]);
      asserts.assertEquals(typeof s.startTimeUnixNano, 'string');
      asserts.assertEquals(typeof s.endTimeUnixNano, 'string');
      asserts.assertEquals(s.startTimeUnixNano, '1700000000000000000');
      asserts.assertEquals(s.endTimeUnixNano, '1700000000120000000');
    });

    it('wraps attribute values in the typed AnyValue form', () => {
      const s = oneSpan([
        spanData({
          attributes: {
            str: 'x',
            int: 42,
            float: 1.5,
            bool: true,
            list: ['a', 'b'],
          },
        }),
      ]);
      const byKey = Object.fromEntries(
        s.attributes.map((a) => [a.key, a.value]),
      );
      asserts.assertEquals(byKey.str, { stringValue: 'x' });
      // intValue is itself a STRING — int64 does not fit a JSON number.
      asserts.assertEquals(byKey.int, { intValue: '42' });
      asserts.assertEquals(byKey.float, { doubleValue: 1.5 });
      asserts.assertEquals(byKey.bool, { boolValue: true });
      asserts.assertEquals(byKey.list, {
        arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] },
      });
    });

    it('emits kind and status.code as numeric enums', () => {
      const s = oneSpan([
        spanData({
          kind: SpanKind.CLIENT,
          status: { code: SpanStatusCode.ERROR, message: 'boom' },
        }),
      ]);
      asserts.assertEquals(s.kind, 3);
      asserts.assertEquals(s.status, { code: 2, message: 'boom' });
    });

    it('omits status.message unless set', () => {
      const s = oneSpan([spanData()]);
      asserts.assertEquals(s.status, { code: 0 });
      asserts.assertEquals('message' in s.status, false);
    });

    it('omits parentSpanId on a root span rather than sending empty', () => {
      const root = oneSpan([spanData()]);
      asserts.assertEquals('parentSpanId' in root, false);
      const child = oneSpan([spanData({ parentSpanId: 'c'.repeat(16) })]);
      asserts.assertEquals(child.parentSpanId, 'c'.repeat(16));
    });

    it('encodes events with their own nanosecond timestamps', () => {
      const s = oneSpan([
        spanData({
          events: [{
            name: 'exception',
            time: new Date(1_700_000_000_050),
            attributes: { 'exception.type': 'TypeError' },
          }],
        }),
      ]);
      asserts.assertEquals(s.events.length, 1);
      asserts.assertEquals(s.events[0]!.name, 'exception');
      asserts.assertEquals(s.events[0]!.timeUnixNano, '1700000000050000000');
      asserts.assertEquals(s.events[0]!.attributes[0], {
        key: 'exception.type',
        value: { stringValue: 'TypeError' },
      });
    });

    it('produces the resourceSpans -> scopeSpans -> spans envelope', () => {
      const payload = encodeSpans([spanData()]);
      const rs = payload.resourceSpans[0]!;
      asserts.assertEquals(rs.resource.attributes[0], {
        key: 'service.name',
        value: { stringValue: 'orders' },
      });
      asserts.assertEquals(rs.scopeSpans[0]!.scope.name, '@tundralibs/tracer');
      asserts.assertEquals(rs.scopeSpans[0]!.spans.length, 1);
    });
  });

  describe('batching and resilience', () => {
    it('groups spans by resource', () => {
      const payload = encodeSpans([
        spanData({ resource: { 'service.name': 'a' } }),
        spanData({ resource: { 'service.name': 'b' } }),
        spanData({ resource: { 'service.name': 'a' } }),
      ]);
      asserts.assertEquals(payload.resourceSpans.length, 2);
      const counts = payload.resourceSpans.map((r) =>
        r.scopeSpans[0]!.spans.length
      ).sort();
      asserts.assertEquals(counts, [1, 2]);
    });

    it('skips a malformed span instead of losing the batch', () => {
      const bad = spanData({
        context: { traceId: 'NOT-HEX', spanId: SPAN_ID, traceFlags: 1 },
      });
      const errors: unknown[] = [];
      const payload = encodeSpans([bad, spanData()], (_s, e) => errors.push(e));
      asserts.assertEquals(errors.length, 1);
      // The good span still made it.
      asserts.assertEquals(
        payload.resourceSpans[0]!.scopeSpans[0]!.spans.length,
        1,
      );
    });

    it('returns an empty envelope when every span fails', () => {
      const bad = spanData({
        context: { traceId: 'bad', spanId: 'bad', traceFlags: 1 },
      });
      asserts.assertEquals(encodeSpans([bad]).resourceSpans, []);
    });

    it('encodes an empty batch to an empty envelope', () => {
      asserts.assertEquals(encodeSpans([]).resourceSpans, []);
    });
  });

  describe('helpers', () => {
    it('toAnyValue distinguishes integers from floats', () => {
      asserts.assertEquals(toAnyValue(7), { intValue: '7' });
      asserts.assertEquals(toAnyValue(7.5), { doubleValue: 7.5 });
    });

    it('toAnyValue nests array elements', () => {
      asserts.assertEquals(toAnyValue([1, 2]), {
        arrayValue: { values: [{ intValue: '1' }, { intValue: '2' }] },
      });
    });

    it('toKeyValues drops null and undefined values', () => {
      const out = toKeyValues(
        { a: 1, b: null, c: undefined } as unknown as Record<string, never>,
      );
      asserts.assertEquals(out.map((k) => k.key), ['a']);
    });

    it('the whole payload survives JSON round-tripping', () => {
      const payload = encodeSpans([spanData({ attributes: { n: 1 } })]);
      asserts.assertEquals(JSON.parse(JSON.stringify(payload)), payload);
    });
  });
});
