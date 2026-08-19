/**
 * @fileoverview resolveClientAddress — the trustProxy hop logic that
 * decides which address is the trustworthy client (U5).
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { resolveClientAddress } from './resolveClientAddress.ts';

const h = (init: Record<string, string> = {}) => new Headers(init);

describe('rapid.resolveClientAddress', () => {
  it('trustProxy off: proxy headers are ignored (unspoofable)', () => {
    for (const tp of [false, 0, undefined] as const) {
      const r = resolveClientAddress(
        '8.8.8.8',
        h({ 'x-forwarded-for': '1.2.3.4' }),
        tp,
      );
      asserts.assertEquals(r.address, '8.8.8.8'); // socket peer only
    }
  });

  it('private socket peer with trust off → no trustworthy client', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '9.9.9.9' }),
      false,
    );
    asserts.assertEquals(r.address, ''); // private socket, header untrusted
  });

  it('trustProxy=1 takes the RIGHTMOST hop, not the forgeable leftmost', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8' }),
      1,
    );
    asserts.assertEquals(r.address, '8.8.8.8');
  });

  it('true maps to one hop', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8' }),
      true,
    );
    asserts.assertEquals(r.address, '8.8.8.8');
  });

  it('trustProxy=2 walks back two hops', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '4.4.4.4, 1.1.1.1, 8.8.8.8' }),
      2,
    );
    asserts.assertEquals(r.address, '1.1.1.1');
  });

  it('more trusted hops than forwarded → clamps to the leftmost (client)', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '8.8.8.8' }),
      5,
    );
    asserts.assertEquals(r.address, '8.8.8.8');
  });

  it('x-real-ip is the fallback when no x-forwarded-for', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-real-ip': '8.8.8.8' }),
      1,
    );
    asserts.assertEquals(r.address, '8.8.8.8');
  });

  it('a private resolved hop yields no client address', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '192.168.1.1' }),
      1,
    );
    asserts.assertEquals(r.address, '');
  });

  it('chain records socket peer + forwarded hops in order', () => {
    const r = resolveClientAddress(
      '10.0.0.1',
      h({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8' }),
      1,
    );
    asserts.assertEquals(r.chain, ['10.0.0.1', '1.1.1.1', '8.8.8.8']);
  });
});
