import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Span, SpanKind, SpanStatusCode } from './mod.ts';
import type { SpanData, SpanInit } from './mod.ts';

const makeSpan = (
  overrides: Partial<SpanInit> = {},
): { span: Span; ended: SpanData[] } => {
  const ended: SpanData[] = [];
  const span = new Span({
    name: 'op',
    context: {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: 1,
    },
    kind: SpanKind.INTERNAL,
    startTime: new Date(1000),
    resource: { 'service.name': 'test' },
    recording: true,
    onEnd: (data) => ended.push(data),
    ...overrides,
  });
  return { span, ended };
};

describe('tracer.Span', () => {
  it('records attributes, chaining', () => {
    const { span } = makeSpan();
    span.setAttribute('a', 1).setAttribute('b', 'two').setAttribute('c', true);
    span.setAttributes({ d: [1, 2], e: false });
    span.end();
    asserts.assertEquals(span.toData().attributes, {
      a: 1,
      b: 'two',
      c: true,
      d: [1, 2],
      e: false,
    });
  });

  it('seeds attributes supplied at construction', () => {
    const { span } = makeSpan({ attributes: { seeded: 'yes' } });
    asserts.assertEquals(span.toData().attributes.seeded, 'yes');
  });

  it('drops null and undefined attribute values', () => {
    const { span } = makeSpan();
    // deno-lint-ignore no-explicit-any
    span.setAttribute('nope', null as any).setAttribute(
      'nada',
      undefined as any,
    );
    asserts.assertEquals(span.toData().attributes, {});
  });

  it('records events in insertion order', () => {
    const { span } = makeSpan();
    span.addEvent('first', { i: 1 }, new Date(2000));
    span.addEvent('second');
    const events = span.toData().events;
    asserts.assertEquals(events.length, 2);
    asserts.assertEquals(events[0]!.name, 'first');
    asserts.assertEquals(events[0]!.attributes, { i: 1 });
    asserts.assertEquals(events[0]!.time, new Date(2000));
    asserts.assertEquals(events[1]!.name, 'second');
    asserts.assertEquals(events[1]!.attributes, {});
  });

  it('defaults status to UNSET and records an explicit status', () => {
    const { span } = makeSpan();
    asserts.assertEquals(span.toData().status.code, SpanStatusCode.UNSET);
    span.setStatus(SpanStatusCode.ERROR, 'boom');
    asserts.assertEquals(span.toData().status, {
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });
    span.setStatus(SpanStatusCode.OK);
    asserts.assertEquals(span.toData().status, { code: SpanStatusCode.OK });
  });

  it('records an Error as an exception event with semantic attributes', () => {
    const { span } = makeSpan();
    span.recordException(new TypeError('bad input'));
    const event = span.toData().events[0]!;
    asserts.assertEquals(event.name, 'exception');
    asserts.assertEquals(event.attributes['exception.type'], 'TypeError');
    asserts.assertEquals(event.attributes['exception.message'], 'bad input');
    asserts.assert(
      typeof event.attributes['exception.stacktrace'] === 'string',
    );
  });

  it('records an Error without a stack', () => {
    const { span } = makeSpan();
    const error = new Error('no stack');
    error.stack = undefined;
    span.recordException(error);
    const attributes = span.toData().events[0]!.attributes;
    asserts.assertEquals(attributes['exception.stacktrace'], undefined);
    asserts.assertEquals(attributes['exception.message'], 'no stack');
  });

  it('stringifies a non-Error thrown value', () => {
    const { span } = makeSpan();
    span.recordException('just a string');
    asserts.assertEquals(
      span.toData().events[0]!.attributes['exception.message'],
      'just a string',
    );
  });

  it('hands a snapshot to onEnd exactly once', () => {
    const { span, ended } = makeSpan();
    span.end(new Date(5000));
    span.end(new Date(9999)); // idempotent
    asserts.assertEquals(ended.length, 1);
    asserts.assertEquals(ended[0]!.endTime, new Date(5000));
    asserts.assertEquals(ended[0]!.name, 'op');
    asserts.assertEquals(ended[0]!.resource['service.name'], 'test');
  });

  it('stops recording after end()', () => {
    const { span } = makeSpan();
    asserts.assertEquals(span.isRecording(), true);
    span.end();
    asserts.assertEquals(span.isRecording(), false);
    span.setAttribute('late', 1).addEvent('late').setStatus(SpanStatusCode.OK);
    const data = span.toData();
    asserts.assertEquals(data.attributes, {});
    asserts.assertEquals(data.events, []);
    asserts.assertEquals(data.status.code, SpanStatusCode.UNSET);
  });

  it('is inert when sampling dropped it, but still carries its context', () => {
    const { span, ended } = makeSpan({ recording: false });
    asserts.assertEquals(span.isRecording(), false);
    span.setAttribute('a', 1).addEvent('e').setStatus(SpanStatusCode.ERROR);
    span.recordException(new Error('x'));
    span.end();
    asserts.assertEquals(ended.length, 0); // never exported
    asserts.assertEquals(span.toData().attributes, {});
    asserts.assertEquals(span.context.traceId, 'a'.repeat(32)); // still propagates
  });

  it('snapshots defensively — mutating the result cannot alter the span', () => {
    const { span } = makeSpan();
    span.setAttribute('a', 1);
    const data = span.toData();
    data.attributes.a = 999;
    data.events.push({ name: 'injected', time: new Date(), attributes: {} });
    asserts.assertEquals(span.toData().attributes.a, 1);
    asserts.assertEquals(span.toData().events.length, 0);
  });

  it('exposes parent id and kind', () => {
    const { span } = makeSpan({
      parentSpanId: 'c'.repeat(16),
      kind: SpanKind.SERVER,
    });
    asserts.assertEquals(span.parentSpanId, 'c'.repeat(16));
    asserts.assertEquals(span.kind, SpanKind.SERVER);
  });
});
