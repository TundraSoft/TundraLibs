/**
 * @fileoverview Key-bound JWE: round trips per `enc`, the protected
 * header as AAD, and every rejection reason.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { decodeBase64Url, encodeBase64Url } from '@std/encoding';
import { decryptJwe, encryptJwe, parseJweHeader } from './jwe.ts';
import { PactError } from './errors/mod.ts';

const SECRET = 'pk_as_0123456789abcdef';
const TEXT = new TextDecoder();

async function rejects(p: Promise<unknown>, reason: string): Promise<void> {
  const error = await asserts.assertRejects(() => p, PactError);
  asserts.assertStrictEquals(error.code, 'ENCRYPTION_INVALID');
  asserts.assertStringIncludes(error.message, reason);
}

describe('jwe', () => {
  it('should round-trip under both encryptions with a dir/kid header', async () => {
    for (const enc of ['A128GCM', 'A256GCM'] as const) {
      const jwe = await encryptJwe(SECRET, 'k1', '{"amount":5}', enc);
      const [header, encryptedKey] = jwe.split('.');
      asserts.assertStrictEquals(encryptedKey, '', 'alg dir has no CEK part');
      asserts.assertEquals(
        JSON.parse(TEXT.decode(decodeBase64Url(header!))),
        { alg: 'dir', enc, kid: 'k1' },
      );
      asserts.assertEquals(parseJweHeader(jwe), { alg: 'dir', enc, kid: 'k1' });
      const plain = await decryptJwe(SECRET, 'k1', jwe, [enc]);
      asserts.assertStrictEquals(TEXT.decode(plain), '{"amount":5}');
    }
    // Byte input and a fresh IV per call.
    const a = await encryptJwe(
      SECRET,
      'k1',
      new Uint8Array([1, 2, 3]),
      'A256GCM',
    );
    const b = await encryptJwe(
      SECRET,
      'k1',
      new Uint8Array([1, 2, 3]),
      'A256GCM',
    );
    asserts.assertNotStrictEquals(a, b);
    asserts.assertEquals(
      await decryptJwe(SECRET, 'k1', a, ['A256GCM']),
      new Uint8Array([1, 2, 3]),
    );
  });

  it('should bind the ciphertext to the secret, the key id, and the enc', async () => {
    const jwe = await encryptJwe(SECRET, 'k1', 'x', 'A256GCM');
    await rejects(decryptJwe('other-secret', 'k1', jwe, ['A256GCM']), 'tag');
    await rejects(decryptJwe(SECRET, 'k2', jwe, ['A256GCM']), 'kid');
    await rejects(decryptJwe(SECRET, 'k1', jwe, ['A128GCM']), 'enc must be');
    // Tampering with the protected header (AAD) breaks the tag even when
    // the header still parses.
    const parts = jwe.split('.');
    parts[0] = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({ alg: 'dir', enc: 'A256GCM', kid: 'k1', x: 1 }),
      ),
    );
    await rejects(
      decryptJwe(SECRET, 'k1', parts.join('.'), ['A256GCM']),
      'tag',
    );
  });

  it('should reject malformed tokens and foreign algorithms by reason', async () => {
    const good = await encryptJwe(SECRET, 'k1', 'x', 'A256GCM');
    const parts = good.split('.') as [string, string, string, string, string];
    const header = (h: Record<string, unknown>) =>
      encodeBase64Url(new TextEncoder().encode(JSON.stringify(h)));
    const cases: [string, string][] = [
      ['a.b.c', 'not a compact JWE'],
      [`${parts[0]}.cek.${parts[2]}.${parts[3]}.${parts[4]}`, 'alg "dir"'],
      [`%%%..${parts[2]}.${parts[3]}.${parts[4]}`, 'unreadable'],
      [
        `${header({ alg: 'A256KW', enc: 'A256GCM', kid: 'k1' })}..${parts[2]}.${
          parts[3]
        }.${parts[4]}`,
        'alg "dir"',
      ],
      [`${parts[0]}..%%.${parts[3]}.${parts[4]}`, 'malformed base64url'],
      [
        `${parts[0]}..${encodeBase64Url(new Uint8Array(4))}.${parts[3]}.${
          parts[4]
        }`,
        'iv or tag',
      ],
    ];
    for (const [jwe, reason] of cases) {
      await rejects(decryptJwe(SECRET, 'k1', jwe, ['A256GCM']), reason);
    }
    asserts.assertStrictEquals(parseJweHeader(''), null);
    asserts.assertStrictEquals(parseJweHeader('%%%.x'), null);
  });
});
