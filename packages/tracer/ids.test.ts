import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { createRandomIdGenerator, randomIdGenerator } from './mod.ts';
import type { RandomBytes } from './mod.ts';
import { isZeroId, toHex } from './ids.ts';

describe('tracer.ids', () => {
  it('toHex encodes bytes as lowercase hex, two chars per byte', () => {
    asserts.assertEquals(toHex(new Uint8Array([0, 15, 16, 255])), '000f10ff');
    asserts.assertEquals(toHex(new Uint8Array(0)), '');
  });

  it('isZeroId detects the all-zero id', () => {
    asserts.assertEquals(isZeroId('0'.repeat(32)), true);
    asserts.assertEquals(isZeroId('0'.repeat(15) + '1'), false);
  });

  it('generates W3C-conformant trace and span ids', () => {
    asserts.assertMatch(randomIdGenerator.traceId(), /^[0-9a-f]{32}$/);
    asserts.assertMatch(randomIdGenerator.spanId(), /^[0-9a-f]{16}$/);
  });

  it('generates distinct ids across calls', () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => randomIdGenerator.traceId()),
    );
    asserts.assertEquals(ids.size, 100);
  });

  it('redraws when the random source yields an all-zero id', () => {
    let call = 0;
    const source: RandomBytes = (length) => {
      call++;
      // First draw is all-zero (invalid per W3C) and must be rejected.
      return call === 1
        ? new Uint8Array(length)
        : new Uint8Array(length).fill(0x07);
    };
    const generator = createRandomIdGenerator(source);
    asserts.assertEquals(generator.traceId(), '07'.repeat(16));
    asserts.assertEquals(call, 2);
  });

  it('accepts an injected deterministic source', () => {
    const source: RandomBytes = (length) => new Uint8Array(length).fill(0xab);
    const generator = createRandomIdGenerator(source);
    asserts.assertEquals(generator.traceId(), 'ab'.repeat(16));
    asserts.assertEquals(generator.spanId(), 'ab'.repeat(8));
  });
});
