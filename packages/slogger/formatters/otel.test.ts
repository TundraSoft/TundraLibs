// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities } from '@tundralibs/utils';
import { otelLogFormatter } from './otel.ts';
import type { SlogObject } from '../types/mod.ts';

const makeLog = (
  level: SyslogSeverities,
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: 'L1',
  appName: 'svc',
  hostname: 'h01',
  level,
  levelName: SyslogSeverities[level] as any,
  context,
  message,
  date: new Date('2026-05-11T00:00:00Z'),
  isoDate: '2026-05-11T00:00:00.000Z',
  timestamp: 1778478400000,
});

describe('slogger.formatters.otel', () => {
  it('produces the canonical OTel envelope', () => {
    const fmt = otelLogFormatter();
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hello')));
    asserts.assertEquals(out.timeUnixNano, '1778478400000000000');
    asserts.assertEquals(out.severityNumber, 9);
    asserts.assertEquals(out.severityText, 'INFO');
    asserts.assertEquals(out.body, 'hello');
    asserts.assertEquals(out.attributes, {});
    asserts.assertEquals(out.resource, {
      'service.name': 'svc',
      'host.name': 'h01',
    });
  });

  describe('severity mapping', () => {
    const expected: Array<[SyslogSeverities, number, string]> = [
      [SyslogSeverities.EMERGENCY, 22, 'FATAL2'],
      [SyslogSeverities.ALERT, 21, 'FATAL'],
      [SyslogSeverities.CRITICAL, 18, 'ERROR2'],
      [SyslogSeverities.ERROR, 17, 'ERROR'],
      [SyslogSeverities.WARNING, 13, 'WARN'],
      [SyslogSeverities.NOTICE, 10, 'INFO2'],
      [SyslogSeverities.INFO, 9, 'INFO'],
      [SyslogSeverities.DEBUG, 5, 'DEBUG'],
    ];
    for (const [level, num, text] of expected) {
      it(`maps syslog ${SyslogSeverities[level]} → OTel ${text}(${num})`, () => {
        const fmt = otelLogFormatter();
        const out = JSON.parse(fmt(makeLog(level, 'x')));
        asserts.assertEquals(out.severityNumber, num);
        asserts.assertEquals(out.severityText, text);
      });
    }
  });

  it('flattens nested context into attributes with dot-paths', () => {
    const fmt = otelLogFormatter();
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hi', {
      user: { id: 42, name: 'Alice' },
      ip: '10.0.0.1',
    })));
    asserts.assertEquals(out.attributes, {
      'user.id': 42,
      'user.name': 'Alice',
      ip: '10.0.0.1',
    });
  });

  it('merges resource attributes from options (caller wins on collision)', () => {
    const fmt = otelLogFormatter({
      resource: {
        'service.version': '1.2.3',
        'service.name': 'override', // takes precedence over appName
        'deployment.environment': 'prod',
      },
    });
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hi')));
    asserts.assertEquals(out.resource, {
      'service.name': 'override',
      'host.name': 'h01',
      'service.version': '1.2.3',
      'deployment.environment': 'prod',
    });
  });

  it('hoists traceId / spanId / traceFlags out of context into top-level fields', () => {
    const fmt = otelLogFormatter();
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hi', {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
      userId: 42,
    })));
    asserts.assertEquals(out.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    asserts.assertEquals(out.spanId, '00f067aa0ba902b7');
    asserts.assertEquals(out.traceFlags, 1);
    // Hoisted fields don't appear under attributes:
    asserts.assertEquals(out.attributes, { userId: 42 });
  });

  it('respects custom traceFields key names', () => {
    const fmt = otelLogFormatter({
      traceFields: { traceId: 'x-trace-id', spanId: 'x-span-id' },
    });
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hi', {
      'x-trace-id': 'abc',
      'x-span-id': 'def',
      data: 1,
    })));
    asserts.assertEquals(out.traceId, 'abc');
    asserts.assertEquals(out.spanId, 'def');
    asserts.assertEquals(out.attributes, { data: 1 });
  });

  it('traceFields: null disables hoisting — trace IDs stay in attributes', () => {
    const fmt = otelLogFormatter({ traceFields: null });
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hi', {
      traceId: 'abc',
      spanId: 'def',
    })));
    asserts.assertEquals(out.traceId, undefined);
    asserts.assertEquals(out.attributes, { traceId: 'abc', spanId: 'def' });
  });

  it('preserves Date / array values in attributes', () => {
    const fmt = otelLogFormatter();
    const d = new Date('2026-01-01T00:00:00Z');
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'hi', {
      when: d,
      tags: ['a', 'b'],
    })));
    asserts.assertEquals(out.attributes.when, '2026-01-01T00:00:00.000Z');
    asserts.assertEquals(out.attributes.tags, ['a', 'b']);
  });

  it('output is single-line JSON (NDJSON-friendly)', () => {
    const fmt = otelLogFormatter();
    const out = fmt(makeLog(SyslogSeverities.INFO, 'hi', { x: 1 }));
    asserts.assert(!out.includes('\n'), 'expected single-line: ' + out);
    // Round-trips through JSON.parse without errors.
    JSON.parse(out);
  });

  // Regression (round-3 finding 6/7): a circular context recursed
  // forever (RangeError) inside _flattenAttributes, and a bigint threw
  // (TypeError) in the final JSON.stringify — both swallowed by
  // Slogger.log(), silently dropping the whole record. jsonFormatter was
  // hardened; this sibling was not.
  it('renders a circular context as [Circular] instead of throwing', () => {
    const fmt = otelLogFormatter();
    const req: Record<string, unknown> = { id: 7 };
    req.self = req; // cycle
    const out = JSON.parse(
      fmt(makeLog(SyslogSeverities.ERROR, 'boom', { req })),
    );
    asserts.assertEquals(out.attributes['req.id'], 7);
    asserts.assertEquals(out.attributes['req.self'], '[Circular]');
  });

  it('serializes bigint attribute values instead of throwing', () => {
    const fmt = otelLogFormatter();
    // Scalar, in-array, and nested bigints all threw before hardening.
    const out = JSON.parse(fmt(makeLog(SyslogSeverities.INFO, 'ids', {
      scalar: 10n,
      ids: [1n, 2n],
      nested: { big: 3n },
    })));
    asserts.assertEquals(out.attributes.scalar, '10');
    asserts.assertEquals(out.attributes.ids, ['1', '2']);
    asserts.assertEquals(out.attributes['nested.big'], '3');
  });
});
