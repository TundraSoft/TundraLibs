/**
 * @fileoverview Minimal DER/PEM reader for asymmetric key material.
 *
 * Web Crypto's `importKey` needs to be told *which* algorithm and — for
 * elliptic curve keys — *which* curve a blob of DER holds, but a PEM string
 * carries that information inside the encoding rather than alongside it. This
 * module reads just enough ASN.1 to answer two questions without pulling in a
 * general-purpose parser:
 *
 * 1. Is this DER an RSA key or an EC key, and if EC, on which curve?
 * 2. Can a SEC1 `EC PRIVATE KEY` be rewrapped as the PKCS#8 that Web Crypto
 *    actually accepts?
 *
 * It is deliberately *not* a general ASN.1 library: only the definite-length,
 * single-byte-tag subset that DER-encoded keys use is understood, and anything
 * outside that raises. Nothing here is exported from the package's public
 * surface.
 *
 * @module
 * @internal
 * @see {@link https://www.rfc-editor.org/rfc/rfc5280#section-4.1} RFC 5280 — SubjectPublicKeyInfo
 * @see {@link https://www.rfc-editor.org/rfc/rfc5208#section-5} RFC 5208 — PrivateKeyInfo (PKCS#8)
 * @see {@link https://www.rfc-editor.org/rfc/rfc5915} RFC 5915 — ECPrivateKey (SEC1)
 */

import type { ECCurve } from './types/mod.ts';

/** ASN.1 universal tag for `SEQUENCE`. */
const TAG_SEQUENCE = 0x30;
/** ASN.1 universal tag for `INTEGER`. */
const TAG_INTEGER = 0x02;
/** ASN.1 universal tag for `OCTET STRING`. */
const TAG_OCTET_STRING = 0x04;
/** ASN.1 universal tag for `OBJECT IDENTIFIER`. */
const TAG_OID = 0x06;
/** Context-specific constructed `[0]` — SEC1's `parameters` field. */
const TAG_SEC1_PARAMETERS = 0xa0;
/** Context-specific constructed `[1]` — SEC1's `publicKey` field. */
const TAG_SEC1_PUBLIC_KEY = 0xa1;

/** OID `1.2.840.10045.2.1` (id-ecPublicKey), DER content octets. */
const OID_EC_PUBLIC_KEY = new Uint8Array([
  0x2a,
  0x86,
  0x48,
  0xce,
  0x3d,
  0x02,
  0x01,
]);

/** OID `1.3.101.112` (id-Ed25519, RFC 8410), DER content octets. */
const OID_ED25519 = new Uint8Array([0x2b, 0x65, 0x70]);

/**
 * Named-curve OIDs, DER content octets, keyed by the Web Crypto curve name.
 *
 * - `P-256` — `1.2.840.10045.3.1.7` (prime256v1 / secp256r1)
 * - `P-384` — `1.3.132.0.34` (secp384r1)
 * - `P-521` — `1.3.132.0.35` (secp521r1)
 */
const CURVE_OIDS: ReadonlyArray<readonly [ECCurve, Uint8Array]> = [
  ['P-256', new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])],
  ['P-384', new Uint8Array([0x2b, 0x81, 0x04, 0x00, 0x22])],
  ['P-521', new Uint8Array([0x2b, 0x81, 0x04, 0x00, 0x23])],
];

/** A parsed ASN.1 tag-length-value triple, expressed as offsets into a buffer. */
export type Tlv = {
  /** The (single-byte) identifier octet. */
  tag: number;
  /** Offset of the identifier octet — the start of the whole element. */
  start: number;
  /** Offset of the first content octet. */
  contentStart: number;
  /** Offset one past the last content octet — also the end of the element. */
  end: number;
};

/**
 * Reads one DER element at `offset`.
 *
 * @param bytes - Buffer holding DER.
 * @param offset - Offset of the element's identifier octet.
 * @returns The element's {@link Tlv} offsets.
 * @throws {Error} When the element is truncated, uses a multi-byte tag, or
 *   uses a length form this reader does not implement (indefinite length, or
 *   a long form wider than four octets).
 * @internal
 */
export const readTlv = (bytes: Uint8Array, offset: number): Tlv => {
  if (offset + 2 > bytes.length) {
    throw new Error('Malformed DER: truncated element header');
  }
  const tag = bytes[offset]!;
  // Tag numbers >= 31 use the multi-byte form. No key structure needs one.
  if ((tag & 0x1f) === 0x1f) {
    throw new Error('Malformed DER: multi-byte tags are not supported');
  }

  let cursor = offset + 1;
  const first = bytes[cursor]!;
  cursor += 1;

  let length: number;
  if (first < 0x80) {
    // Short form — the length is the octet itself.
    length = first;
  } else {
    const count = first & 0x7f;
    // 0x80 is the indefinite form, which DER forbids; more than four octets
    // would exceed any key we could hold in memory anyway.
    if (count === 0 || count > 4) {
      throw new Error('Malformed DER: unsupported length encoding');
    }
    if (cursor + count > bytes.length) {
      throw new Error('Malformed DER: truncated length');
    }
    length = 0;
    for (let i = 0; i < count; i++) {
      length = length * 256 + bytes[cursor + i]!;
    }
    cursor += count;
  }

  const end = cursor + length;
  if (end > bytes.length) {
    throw new Error('Malformed DER: element runs past the end of the buffer');
  }
  return { tag, start: offset, contentStart: cursor, end };
};

/**
 * Constant-shape byte comparison for OID content octets.
 *
 * @param a - First buffer.
 * @param b - Second buffer.
 * @returns `true` when both hold the same bytes.
 * @internal
 */
const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/**
 * Maps a named-curve OID onto its Web Crypto curve name.
 *
 * @param oid - DER content octets of the curve OID.
 * @returns The matching {@link ECCurve}, or `undefined` when unrecognised.
 * @internal
 */
const curveFromOid = (oid: Uint8Array): ECCurve | undefined =>
  CURVE_OIDS.find(([, bytes]) => bytesEqual(oid, bytes))?.[0];

/**
 * What {@link describeDerKey} learned about a DER-encoded key.
 *
 * @internal
 */
export type DerKeyInfo = {
  /** Key family the `AlgorithmIdentifier` names. */
  family: 'RSA' | 'EC' | 'Ed25519';
  /** Named curve, present only for EC keys. */
  curve?: ECCurve;
};

/**
 * Reads the `AlgorithmIdentifier` of an SPKI (public) or PKCS#8 (private) key
 * and reports which family — and, for EC, which curve — it describes.
 *
 * Both structures begin with a `SEQUENCE` whose `AlgorithmIdentifier` is either
 * the first element (SPKI) or the second (PKCS#8, after the `version`
 * `INTEGER`), so one walk covers both.
 *
 * Structural failures return `undefined` rather than throwing: a PEM this
 * reader cannot walk (PKCS#1 `RSA PRIVATE KEY`, say) is reported as
 * unrecognised so callers can fall back to the RSA routing every PEM had
 * before EC support existed, and let Web Crypto raise the real error. Once the
 * OID *is* confirmed to be id-ecPublicKey, EC-specific problems throw — an
 * unsupported curve must not be quietly mistaken for an RSA key.
 *
 * @param der - DER bytes of an SPKI or PKCS#8 key.
 * @returns The parsed {@link DerKeyInfo}, or `undefined` when the DER is not a
 *   structure this reader recognises.
 * @throws {Error} When the key is EC but omits its `namedCurve` parameter,
 *   states it as explicit curve parameters rather than an OID, or names a
 *   curve other than P-256/P-384/P-521.
 * @internal
 */
export const describeDerKey = (der: Uint8Array): DerKeyInfo | undefined => {
  let element: Tlv;
  let algorithm: Tlv;
  try {
    const outer = readTlv(der, 0);
    if (outer.tag !== TAG_SEQUENCE) {
      return undefined;
    }
    element = readTlv(der, outer.contentStart);
    // PKCS#8 leads with `version INTEGER`; SPKI goes straight to the algorithm.
    if (element.tag === TAG_INTEGER) {
      element = readTlv(der, element.end);
    }
    if (element.tag !== TAG_SEQUENCE) {
      return undefined;
    }
    algorithm = readTlv(der, element.contentStart);
    if (algorithm.tag !== TAG_OID) {
      return undefined;
    }
  } catch {
    // Not a shape this reader understands — see the note above.
    return undefined;
  }
  const oid = der.subarray(algorithm.contentStart, algorithm.end);

  if (bytesEqual(oid, OID_ED25519)) {
    // RFC 8410: id-Ed25519 has no parameters — the OID alone settles it.
    return { family: 'Ed25519' };
  }

  if (!bytesEqual(oid, OID_EC_PUBLIC_KEY)) {
    // Anything that is not id-ecPublicKey or id-Ed25519 is treated as RSA,
    // which is what every PEM reaching this package meant before EC support
    // existed.
    return { family: 'RSA' };
  }

  // For id-ecPublicKey the `parameters` field carries the curve, and RFC 5480
  // §2.1.1 requires the namedCurve choice — implicit and explicit parameters
  // are both forbidden for the curves Web Crypto implements.
  if (algorithm.end >= element.end) {
    throw new Error('Malformed DER: EC key omits its namedCurve parameter');
  }
  const parameters = readTlv(der, algorithm.end);
  if (parameters.tag !== TAG_OID) {
    throw new Error(
      'Unsupported EC key: explicit curve parameters are not supported, ' +
        'only the named curves P-256, P-384 and P-521',
    );
  }
  const curve = curveFromOid(
    der.subarray(parameters.contentStart, parameters.end),
  );
  if (curve === undefined) {
    throw new Error(
      'Unsupported EC curve: only P-256, P-384 and P-521 are supported',
    );
  }
  return { family: 'EC', curve };
};

/**
 * Encodes a DER length prefix.
 *
 * @param length - Content length in octets.
 * @returns The length octets.
 * @internal
 */
const encodeLength = (length: number): number[] => {
  if (length < 0x80) {
    return [length];
  }
  const octets: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    octets.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return [0x80 | octets.length, ...octets];
};

/**
 * Wraps `content` in a DER tag-length-value element.
 *
 * @param tag - Identifier octet.
 * @param content - Content octets.
 * @returns The encoded element.
 * @internal
 */
const encodeTlv = (tag: number, content: Uint8Array): Uint8Array => {
  const length = encodeLength(content.length);
  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
};

/**
 * Concatenates byte buffers.
 *
 * @param parts - Buffers to join, in order.
 * @returns One buffer holding every part.
 * @internal
 */
const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/**
 * Rewraps a SEC1 `ECPrivateKey` (`-----BEGIN EC PRIVATE KEY-----`, the shape
 * `openssl ecparam -genkey` emits) as the PKCS#8 `PrivateKeyInfo` that Web
 * Crypto's `importKey('pkcs8', …)` accepts — Web Crypto has no SEC1 import.
 *
 * The curve moves from SEC1's `[0] parameters` up into the PKCS#8
 * `AlgorithmIdentifier`, and the inner `ECPrivateKey` is re-encoded without it:
 * RFC 5915 §1 says the field SHOULD be omitted once it is redundant, and
 * leaving it in trips the stricter DER parsers among our target runtimes.
 *
 * @param der - DER bytes of a SEC1 `ECPrivateKey`.
 * @returns The equivalent PKCS#8 bytes and the curve read from the key.
 * @throws {Error} When the DER is malformed, when the key omits its curve
 *   (SEC1 makes `parameters` optional, but without it the curve is unknowable),
 *   or when the curve is not one of P-256/P-384/P-521.
 * @internal
 */
export const sec1ToPkcs8 = (
  der: Uint8Array,
): { pkcs8: Uint8Array; curve: ECCurve } => {
  const outer = readTlv(der, 0);
  if (outer.tag !== TAG_SEQUENCE) {
    throw new Error('Malformed SEC1 EC private key: not a SEQUENCE');
  }

  const version = readTlv(der, outer.contentStart);
  if (version.tag !== TAG_INTEGER) {
    throw new Error('Malformed SEC1 EC private key: missing version');
  }
  const privateKey = readTlv(der, version.end);
  if (privateKey.tag !== TAG_OCTET_STRING) {
    throw new Error('Malformed SEC1 EC private key: missing private key');
  }

  // `parameters` and `publicKey` are both OPTIONAL and either may be absent,
  // so scan the remaining elements rather than assuming fixed positions.
  let curveOid: Uint8Array | undefined;
  let publicKey: Tlv | undefined;
  let cursor = privateKey.end;
  while (cursor < outer.end) {
    const element = readTlv(der, cursor);
    if (element.tag === TAG_SEC1_PARAMETERS) {
      const inner = readTlv(der, element.contentStart);
      if (inner.tag !== TAG_OID) {
        throw new Error(
          'Unsupported EC key: explicit curve parameters are not supported, ' +
            'only the named curves P-256, P-384 and P-521',
        );
      }
      curveOid = der.subarray(inner.contentStart, inner.end);
    } else if (element.tag === TAG_SEC1_PUBLIC_KEY) {
      publicKey = element;
    }
    cursor = element.end;
  }

  if (curveOid === undefined) {
    throw new Error(
      'Unsupported EC key: the SEC1 private key names no curve, so the key ' +
        'cannot be imported. Re-encode it as PKCS#8 ' +
        '(`openssl pkcs8 -topk8 -nocrypt`).',
    );
  }
  const curve = curveFromOid(curveOid);
  if (curve === undefined) {
    throw new Error(
      'Unsupported EC curve: only P-256, P-384 and P-521 are supported',
    );
  }

  const innerKey = encodeTlv(
    TAG_SEQUENCE,
    concatBytes(
      der.subarray(version.start, version.end),
      der.subarray(privateKey.start, privateKey.end),
      publicKey === undefined
        ? new Uint8Array(0)
        : der.subarray(publicKey.start, publicKey.end),
    ),
  );

  const pkcs8 = encodeTlv(
    TAG_SEQUENCE,
    concatBytes(
      // PrivateKeyInfo version — always 0 (RFC 5208 §5).
      encodeTlv(TAG_INTEGER, new Uint8Array([0x00])),
      encodeTlv(
        TAG_SEQUENCE,
        concatBytes(
          encodeTlv(TAG_OID, OID_EC_PUBLIC_KEY),
          encodeTlv(TAG_OID, curveOid),
        ),
      ),
      encodeTlv(TAG_OCTET_STRING, innerKey),
    ),
  );

  return { pkcs8, curve };
};
