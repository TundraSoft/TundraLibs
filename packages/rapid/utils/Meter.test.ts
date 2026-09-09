/**
 * @fileoverview Tests for Meter.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Meter } from './Meter.ts';

/**
 * Read one metric's series data out of `collect('JSON')`. The requests,
 * errors and in-flight metrics are counters/gauges, so every series value
 * is a plain number keyed by its canonical label string.
 */
const dataOf = (meter: Meter, name: string): Record<string, number> =>
  (meter.collect('JSON')[name] as { data: Record<string, number> }).data;

describe('rapid.utils.Meter', () => {
  it('begin() returns a numeric timestamp and moves the transport in and out of the in-flight gauge', () => {
    const meter = new Meter();
    const start = meter.begin('http');
    asserts.assertEquals(typeof start, 'number');
    asserts.assertEquals(
      dataOf(meter, 'rapid_requests_in_flight')['transport="http"'],
      1,
    );
    meter.end({ transport: 'http', action: 'find', status: 200, start });
    asserts.assertEquals(
      dataOf(meter, 'rapid_requests_in_flight')['transport="http"'],
      0,
    );
  });

  it('buckets each status into its Nxx status class', () => {
    for (
      const [status, cls] of [
        [200, '2xx'],
        [302, '3xx'],
        [404, '4xx'],
        [503, '5xx'],
      ] as const
    ) {
      const meter = new Meter();
      const start = meter.begin('http');
      meter.end({ transport: 'http', action: 'find', status, start });
      const requests = dataOf(meter, 'rapid_requests_total');
      const key = Object.keys(requests)[0];
      asserts.assert(
        key.includes(`status="${cls}"`),
        `status ${status} should bucket as ${cls}, got ${key}`,
      );
      asserts.assertEquals(requests[key], 1);
    }
  });

  it('increments errors_total only for status >= 500', () => {
    const meter = new Meter();
    const s1 = meter.begin('http');
    meter.end({ transport: 'http', action: 'find', status: 200, start: s1 });
    const s2 = meter.begin('http');
    meter.end({ transport: 'http', action: 'read', status: 503, start: s2 });

    const requestKeys = Object.keys(dataOf(meter, 'rapid_requests_total'));
    asserts.assert(requestKeys.some((k) => k.includes('status="2xx"')));
    asserts.assert(requestKeys.some((k) => k.includes('status="5xx"')));

    // Only the 503 invocation is an error — the 200 one contributes nothing.
    const errors = dataOf(meter, 'rapid_errors_total');
    asserts.assertEquals(Object.keys(errors).length, 1);
    const errorKey = Object.keys(errors)[0];
    asserts.assert(errorKey.includes('action="read"'));
    asserts.assertEquals(errors[errorKey], 1);
  });

  it('collect() returns a PROMETHEUS string and a JSON object', () => {
    const meter = new Meter();
    const start = meter.begin('http');
    meter.end({ transport: 'http', action: 'find', status: 200, start });

    const prometheus = meter.collect('PROMETHEUS');
    asserts.assertEquals(typeof prometheus, 'string');
    asserts.assert(prometheus.includes('rapid_requests_total'));

    const json = meter.collect('JSON');
    asserts.assertEquals(typeof json, 'object');
    asserts.assert('rapid_requests_total' in json);
  });
});
