import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  alwaysOffSampler,
  alwaysOnSampler,
  ratioSampler,
  SpanKind,
} from './mod.ts';
import type { SamplingInput } from './mod.ts';

const input = (traceId: string): SamplingInput => ({
  traceId,
  name: 'op',
  kind: SpanKind.INTERNAL,
  attributes: {},
});

const LOW = 'a'.repeat(24) + '00000000'; // low end of the id window
const HIGH = 'a'.repeat(24) + 'ffffffff'; // high end

describe('tracer.samplers', () => {
  it('alwaysOn records everything, alwaysOff records nothing', () => {
    asserts.assertEquals(alwaysOnSampler(input(LOW)), true);
    asserts.assertEquals(alwaysOffSampler(input(LOW)), false);
  });

  it('ratioSampler(0) and below collapse to alwaysOff', () => {
    asserts.assertEquals(ratioSampler(0), alwaysOffSampler);
    asserts.assertEquals(ratioSampler(-1), alwaysOffSampler);
  });

  it('ratioSampler(1) and above collapse to alwaysOn', () => {
    asserts.assertEquals(ratioSampler(1), alwaysOnSampler);
    asserts.assertEquals(ratioSampler(2), alwaysOnSampler);
  });

  it('ratioSampler(NaN) collapses to alwaysOff', () => {
    asserts.assertEquals(ratioSampler(NaN), alwaysOffSampler);
  });

  it('ratioSampler splits the id window at the ratio', () => {
    const half = ratioSampler(0.5);
    asserts.assertEquals(half(input(LOW)), true);
    asserts.assertEquals(half(input(HIGH)), false);
  });

  it('ratioSampler is deterministic for a given trace id', () => {
    const sampler = ratioSampler(0.5);
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const first = sampler(input(traceId));
    for (let i = 0; i < 20; i++) {
      asserts.assertEquals(sampler(input(traceId)), first);
    }
  });
});
