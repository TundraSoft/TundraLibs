import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { describeDerKey, sec1ToPkcs8 } from './asn1.ts';
import { pemToDer } from './keys.ts';

/**
 * Every PEM below was produced by OpenSSL 3.x, not by this package, so the
 * parser is tested against the encodings it will actually meet in the wild
 * rather than against its own output:
 *
 * ```
 * openssl ecparam -name prime256v1 -genkey -noout -out sec1.pem
 * openssl pkcs8 -topk8 -nocrypt -in sec1.pem -out pkcs8.pem
 * openssl ec -in sec1.pem -pubout -out spki.pem
 * ```
 */
const SEC1_P256 = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIDogV1jG+c/EcX+YpB53qf6aD9TpKQLoqckCIW+93D6AoAoGCCqGSM49
AwEHoUQDQgAE3EwCtZAAytyIxtIpxbUTW1/KTNceXfXaITN6c0ZabGlOoh0FdFpn
ds7wUkca5iyvROqi80JD5gikerIbHaPpDQ==
-----END EC PRIVATE KEY-----`;

const PKCS8_P256 = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgOiBXWMb5z8Rxf5ik
Hnep/poP1OkpAuipyQIhb73cPoChRANCAATcTAK1kADK3IjG0inFtRNbX8pM1x5d
9dohM3pzRlpsaU6iHQV0Wmd2zvBSRxrmLK9E6qLzQkPmCKR6shsdo+kN
-----END PRIVATE KEY-----`;

const SPKI_P256 = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE3EwCtZAAytyIxtIpxbUTW1/KTNce
XfXaITN6c0ZabGlOoh0FdFpnds7wUkca5iyvROqi80JD5gikerIbHaPpDQ==
-----END PUBLIC KEY-----`;

const SEC1_P384 = `-----BEGIN EC PRIVATE KEY-----
MIGkAgEBBDCsUjo+dtYwwHKj6Q7Xx17VKK0ZN2EYAH+bOEtKdjDvDNMng5oV1cN5
Fc4ai1qBGP+gBwYFK4EEACKhZANiAAROb7G0G1RlddSu8R3HLvf6727KIlcErmvy
phY0np5jpJVJNLCkGJWo0Id+13FRyj4u1etx3FvYVnO4Rr+6jssQIAKVA3T0FPpp
c+QtrxBgYovppdgWGcOKuHoAD3SmYrk=
-----END EC PRIVATE KEY-----`;

const PKCS8_P384 = `-----BEGIN PRIVATE KEY-----
MIG2AgEAMBAGByqGSM49AgEGBSuBBAAiBIGeMIGbAgEBBDCsUjo+dtYwwHKj6Q7X
x17VKK0ZN2EYAH+bOEtKdjDvDNMng5oV1cN5Fc4ai1qBGP+hZANiAAROb7G0G1Rl
ddSu8R3HLvf6727KIlcErmvyphY0np5jpJVJNLCkGJWo0Id+13FRyj4u1etx3FvY
VnO4Rr+6jssQIAKVA3T0FPppc+QtrxBgYovppdgWGcOKuHoAD3SmYrk=
-----END PRIVATE KEY-----`;

const SPKI_P384 = `-----BEGIN PUBLIC KEY-----
MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAETm+xtBtUZXXUrvEdxy73+u9uyiJXBK5r
8qYWNJ6eY6SVSTSwpBiVqNCHftdxUco+LtXrcdxb2FZzuEa/uo7LECAClQN09BT6
aXPkLa8QYGKL6aXYFhnDirh6AA90pmK5
-----END PUBLIC KEY-----`;

/** `openssl genrsa -traditional` — PKCS#1, which Web Crypto cannot import. */
const PKCS1_RSA = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAwjNC7sLk3EBgq1CcDDGv0cKobgjBICJY3ZSKoI19qUPrLAaP
-----END RSA PRIVATE KEY-----`;

const der = (pem: string): Uint8Array => pemToDer(pem).der;

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/**
 * Minimal DER builders, so the hand-rolled fixtures below carry correct length
 * octets by construction — a wrong length would make the parser bail as
 * "unrecognised" and quietly pass a test that meant to exercise a later branch.
 * Short-form lengths only; every fixture here is well under 128 bytes.
 */
const tlv = (tag: number, ...content: number[]): number[] => [
  tag,
  content.length,
  ...content,
];
const seq = (...content: number[]): number[] => tlv(0x30, ...content);
const oid = (...content: number[]): number[] => tlv(0x06, ...content);

/** OID 1.2.840.10045.2.1 — id-ecPublicKey. */
const OID_EC_PUBLIC_KEY = [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];
/** OID 1.3.132.0.10 — secp256k1, a curve Web Crypto does not implement. */
const OID_SECP256K1 = [0x2b, 0x81, 0x04, 0x00, 0x0a];

describe('crypt.sign.asn1', () => {
  it('describeDerKey - reads the curve from OpenSSL SPKI and PKCS#8', () => {
    asserts.assertEquals(describeDerKey(der(SPKI_P256)), {
      family: 'EC',
      curve: 'P-256',
    });
    asserts.assertEquals(describeDerKey(der(PKCS8_P256)), {
      family: 'EC',
      curve: 'P-256',
    });
    asserts.assertEquals(describeDerKey(der(SPKI_P384)), {
      family: 'EC',
      curve: 'P-384',
    });
    asserts.assertEquals(describeDerKey(der(PKCS8_P384)), {
      family: 'EC',
      curve: 'P-384',
    });
  });

  it('describeDerKey - classifies RSA keys as RSA', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    asserts.assertEquals(
      describeDerKey(der(keys.publicKeyExported as string)),
      { family: 'RSA' },
    );
    asserts.assertEquals(
      describeDerKey(der(keys.privateKeyExported as string)),
      { family: 'RSA' },
    );
  });

  it('describeDerKey - returns undefined for structures it cannot walk', () => {
    // PKCS#1 has no AlgorithmIdentifier at all. Reporting "unrecognised"
    // rather than throwing is what lets such a key keep its historic RSA
    // routing, so Web Crypto raises the real error instead of the parser.
    asserts.assertEquals(describeDerKey(der(PKCS1_RSA)), undefined);
    // Not a SEQUENCE.
    asserts.assertEquals(
      describeDerKey(new Uint8Array([0x02, 0x01, 0x00])),
      undefined,
    );
    // Truncated.
    asserts.assertEquals(describeDerKey(new Uint8Array([0x30])), undefined);
    asserts.assertEquals(
      describeDerKey(new Uint8Array([0x30, 0x7f, 0x02])),
      undefined,
    );
    asserts.assertEquals(describeDerKey(new Uint8Array()), undefined);
  });

  it('describeDerKey - rejects an EC key on an unsupported curve', () => {
    // Same structure as a real SPKI, but the namedCurve OID is secp256k1 — a
    // curve Web Crypto does not implement. Once the key is known to be EC this
    // must raise, NOT fall through to the "unrecognised → RSA" path, or an
    // unusable key would reach the RSA importer and fail incomprehensibly.
    // (The BIT STRING is irrelevant to the AlgorithmIdentifier walk.)
    const spki = new Uint8Array(
      seq(...seq(...oid(...OID_EC_PUBLIC_KEY), ...oid(...OID_SECP256K1))),
    );
    asserts.assertThrows(
      () => describeDerKey(spki),
      Error,
      'Unsupported EC curve',
    );
  });

  it('describeDerKey - rejects explicit curve parameters', () => {
    // `parameters` present but a SEQUENCE (explicit domain parameters) rather
    // than a namedCurve OID — legal ASN.1, unsupported by Web Crypto.
    const spki = new Uint8Array(
      seq(...seq(...oid(...OID_EC_PUBLIC_KEY), ...seq())),
    );
    asserts.assertThrows(
      () => describeDerKey(spki),
      Error,
      'explicit curve parameters are not supported',
    );
  });

  it('sec1ToPkcs8 - output is byte-identical to `openssl pkcs8 -topk8`', () => {
    // The strongest available check on the rewrapping: OpenSSL performed the
    // same conversion on the same key, and the two DER encodings must agree
    // exactly — including dropping the now-redundant `[0] parameters` from the
    // inner ECPrivateKey (RFC 5915 §1).
    for (
      const [sec1, pkcs8, curve] of [
        [SEC1_P256, PKCS8_P256, 'P-256'],
        [SEC1_P384, PKCS8_P384, 'P-384'],
      ] as const
    ) {
      const converted = sec1ToPkcs8(der(sec1));
      asserts.assertEquals(converted.curve, curve);
      asserts.assert(
        bytesEqual(converted.pkcs8, der(pkcs8)),
        `${curve}: converted PKCS#8 differs from OpenSSL's`,
      );
    }
  });

  it('sec1ToPkcs8 - the result imports and signs under Web Crypto', async () => {
    // Web Crypto has no SEC1 import, so the conversion is the only way this
    // key becomes usable at all.
    const { pkcs8, curve } = sec1ToPkcs8(der(SEC1_P256));
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8 as BufferSource,
      { name: 'ECDSA', namedCurve: curve },
      false,
      ['sign'],
    );
    asserts.assertEquals(key.type, 'private');
    asserts.assertEquals(
      (key.algorithm as EcKeyAlgorithm).namedCurve,
      'P-256',
    );

    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode('hello') as BufferSource,
    );
    // The matching public key is the independently-exported SPKI, so a valid
    // signature proves the conversion preserved the private scalar.
    const publicKey = await crypto.subtle.importKey(
      'spki',
      der(SPKI_P256) as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    asserts.assert(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        new TextEncoder().encode('hello') as BufferSource,
      ),
      'signature from the converted key must verify under the SEC1 key pair',
    );
  });

  it('sec1ToPkcs8 - rejects malformed and curve-less input', () => {
    asserts.assertThrows(
      () => sec1ToPkcs8(new Uint8Array([0x02, 0x01, 0x00])),
      Error,
      'not a SEQUENCE',
    );
    // SEQUENCE { INTEGER 1, OCTET STRING } — valid SEC1 shape, but no
    // `[0] parameters`, so the curve is unknowable and guessing is not an
    // option.
    asserts.assertThrows(
      () =>
        sec1ToPkcs8(
          new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x04, 0x01, 0x00]),
        ),
      Error,
      'names no curve',
    );
    // SEQUENCE { OCTET STRING } — missing the version INTEGER.
    asserts.assertThrows(
      () => sec1ToPkcs8(new Uint8Array([0x30, 0x03, 0x04, 0x01, 0x00])),
      Error,
      'missing version',
    );
  });
});
