/**
 * @fileoverview COSE key (RFC 9052/8152) → JWK conversion for
 * `@tundralibs/crypt/cbor`.
 *
 * A WebAuthn credential public key is a COSE_Key — a CBOR map with
 * integer labels. `coseToJwk` turns the decoded map into a
 * Web-Crypto-importable {@link JsonWebKey} plus the algorithm it is bound
 * to, so a caller can `crypto.subtle.importKey('jwk', …)` and verify an
 * assertion signature. Supports the two key types WebAuthn authenticators
 * use in practice: EC2 (P-256/384/521 — `ES*`) and RSA (`RS*`).
 *
 * @module
 */

import { encodeBase64Url } from '@std/encoding';
import { CBORError } from './errors/mod.ts';
import type { CBORValue } from './types/mod.ts';
import type { CoseAlgorithm, CoseKeyResult } from './types/CoseKeyResult.ts';

/** COSE common key labels. */
const LABEL_KTY = 1;
const LABEL_ALG = 3;
/** EC2/OKP: crv=-1, x=-2, y=-3. RSA: n=-1, e=-2. */
const LABEL_CRV_OR_N = -1;
const LABEL_X_OR_E = -2;
const LABEL_Y = -3;

/** COSE key types. */
const KTY_EC2 = 2;
const KTY_RSA = 3;

/** COSE alg label → JWS name. */
const ALG_BY_LABEL: Record<number, CoseAlgorithm> = {
  [-7]: 'ES256',
  [-35]: 'ES384',
  [-36]: 'ES512',
  [-257]: 'RS256',
  [-258]: 'RS384',
  [-259]: 'RS512',
};

/** COSE EC curve label → JWK curve, with the algorithm it implies. */
const EC_CURVE_BY_LABEL: Record<number, { crv: string; alg: CoseAlgorithm }> = {
  1: { crv: 'P-256', alg: 'ES256' },
  2: { crv: 'P-384', alg: 'ES384' },
  3: { crv: 'P-521', alg: 'ES512' },
};

const isBytes = (v: CBORValue): v is Uint8Array => v instanceof Uint8Array;

/**
 * Convert a decoded COSE key (a CBOR `Map` from {@link decodeCBOR}) into a
 * JWK plus its algorithm.
 *
 * The algorithm comes from the COSE `alg` label when present, otherwise it
 * is derived — from the curve for EC2, defaulting to `RS256` for RSA.
 *
 * @param coseKey - the decoded COSE_Key map.
 * @returns the importable {@link CoseKeyResult}.
 * @throws {@link CBORError} when the value is not a map, the key type is
 *   unsupported (only EC2 and RSA), the curve is unknown, or a required
 *   field is missing or not a byte string.
 */
export function coseToJwk(coseKey: CBORValue): CoseKeyResult {
  if (!(coseKey instanceof Map)) {
    throw new CBORError('COSE key must be a CBOR map');
  }
  const kty = coseKey.get(LABEL_KTY);
  const algLabel = coseKey.get(LABEL_ALG);
  const declaredAlg = typeof algLabel === 'number'
    ? ALG_BY_LABEL[algLabel]
    : undefined;

  if (kty === KTY_EC2) {
    const crvLabel = coseKey.get(LABEL_CRV_OR_N);
    const x = coseKey.get(LABEL_X_OR_E);
    const y = coseKey.get(LABEL_Y);
    const curve = typeof crvLabel === 'number'
      ? EC_CURVE_BY_LABEL[crvLabel]
      : undefined;
    if (curve === undefined) {
      throw new CBORError(`unsupported COSE EC curve ${String(crvLabel)}`);
    }
    if (!isBytes(x) || !isBytes(y)) {
      throw new CBORError('COSE EC2 key is missing its x/y coordinates');
    }
    return {
      jwk: {
        kty: 'EC',
        crv: curve.crv,
        x: encodeBase64Url(x),
        y: encodeBase64Url(y),
      },
      algorithm: declaredAlg ?? curve.alg,
    };
  }

  if (kty === KTY_RSA) {
    const n = coseKey.get(LABEL_CRV_OR_N);
    const e = coseKey.get(LABEL_X_OR_E);
    if (!isBytes(n) || !isBytes(e)) {
      throw new CBORError('COSE RSA key is missing its modulus/exponent');
    }
    return {
      jwk: {
        kty: 'RSA',
        n: encodeBase64Url(n),
        e: encodeBase64Url(e),
      },
      algorithm: declaredAlg ?? 'RS256',
    };
  }

  throw new CBORError(`unsupported COSE key type ${String(kty)}`);
}
