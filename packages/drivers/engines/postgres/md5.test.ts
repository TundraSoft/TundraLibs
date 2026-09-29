import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { md5Hex } from './md5.ts';

const enc = new TextEncoder();

// RFC 1321 appendix A.5, plus the lengths either side of the padding
// boundary: 55 bytes pads within one block, 56 and 64 spill into a second.
const VECTORS: [string, string][] = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    'd174ab98d277d9f5a5611c2c9f419d9f',
  ],
  ['1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a'],
  ['a'.repeat(55), 'ef1772b6dff9a122358552954ad0df65'],
  ['a'.repeat(56), '3b0c8ac703f828b04c6c197006d17218'],
  ['a'.repeat(64), '014842d480b571495a4a0363793f7367'],
];

describe('drivers.postgres.md5', () => {
  for (const [input, digest] of VECTORS) {
    it(`hashes a ${input.length}-byte input to its known digest`, () => {
      asserts.assertStrictEquals(md5Hex(enc.encode(input)), digest);
    });
  }
});
