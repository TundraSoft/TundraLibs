import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { extract, FLAG_SAMPLED, inject } from './mod.ts';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';
const VALID = `00-${TRACE_ID}-${SPAN_ID}-01`;

describe('tracer.propagation', () => {
  describe('extract', () => {
    it('parses a valid traceparent from a Headers object', () => {
      const context = extract(new Headers({ traceparent: VALID }));
      asserts.assertEquals(context?.traceId, TRACE_ID);
      asserts.assertEquals(context?.spanId, SPAN_ID);
      asserts.assertEquals(context?.traceFlags, FLAG_SAMPLED);
      asserts.assertEquals(context?.remote, true);
    });

    it('parses from a plain record, case-insensitively', () => {
      asserts.assertEquals(extract({ traceparent: VALID })?.traceId, TRACE_ID);
      asserts.assertEquals(extract({ TraceParent: VALID })?.traceId, TRACE_ID);
    });

    it('parses from a record whose value is an array', () => {
      asserts.assertEquals(
        extract({ traceparent: [VALID] })?.traceId,
        TRACE_ID,
      );
    });

    it('tolerates surrounding whitespace', () => {
      asserts.assertEquals(
        extract({ traceparent: ` ${VALID} ` })?.traceId,
        TRACE_ID,
      );
    });

    it('reads an unsampled flag', () => {
      const context = extract({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-00` });
      asserts.assertEquals(context?.traceFlags, 0);
    });

    it('returns undefined when the header is absent', () => {
      asserts.assertEquals(extract(new Headers()), undefined);
      asserts.assertEquals(extract({}), undefined);
    });

    it('returns undefined for malformed headers rather than throwing', () => {
      for (
        const bad of [
          'garbage',
          '',
          `00-${TRACE_ID}-${SPAN_ID}`, // too few fields
          `00-${TRACE_ID}-${SPAN_ID}-0`, // short flags
          `00-XYZ92f3577b34da6a3ce929d0e0e4736-${SPAN_ID}-01`, // non-hex
          `00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01`, // uppercase
        ]
      ) {
        asserts.assertEquals(extract({ traceparent: bad }), undefined, bad);
      }
    });

    it('rejects the reserved ff version', () => {
      asserts.assertEquals(
        extract({ traceparent: `ff-${TRACE_ID}-${SPAN_ID}-01` }),
        undefined,
      );
    });

    it('rejects all-zero ids', () => {
      asserts.assertEquals(
        extract({ traceparent: `00-${'0'.repeat(32)}-${SPAN_ID}-01` }),
        undefined,
      );
      asserts.assertEquals(
        extract({ traceparent: `00-${TRACE_ID}-${'0'.repeat(16)}-01` }),
        undefined,
      );
    });
  });

  describe('inject', () => {
    it('formats a version-00 traceparent', () => {
      asserts.assertEquals(
        inject({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 }),
        VALID,
      );
    });

    it('zero-pads the flags', () => {
      asserts.assertEquals(
        inject({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 0 }),
        `00-${TRACE_ID}-${SPAN_ID}-00`,
      );
    });

    it('round-trips through extract', () => {
      const original = {
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: FLAG_SAMPLED,
      };
      const parsed = extract({ traceparent: inject(original) });
      asserts.assertEquals(parsed?.traceId, original.traceId);
      asserts.assertEquals(parsed?.spanId, original.spanId);
      asserts.assertEquals(parsed?.traceFlags, original.traceFlags);
    });
  });
});
