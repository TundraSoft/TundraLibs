# CBOR

A minimal **CBOR** (RFC 8949) decoder plus **COSE-key → JWK** conversion,
scoped to what WebAuthn / CTAP2 needs — decode an `attestationObject`, walk
`authenticatorData`, and turn a credential's COSE public key into a
Web-Crypto-importable JWK.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Scope

CTAP2 authenticators MUST emit **canonical** CBOR (definite lengths, no
indefinite items), so the decoder supports exactly that subset: unsigned
and negative integers, byte and text strings, arrays, maps, the simple
values (`false`/`true`/`null`/`undefined`), and half/single/double floats.
Maps decode to a `Map` — not a plain object — so COSE's negative-integer
key labels survive. CBOR **tags** and **indefinite lengths** are rejected;
they never appear in an `attestationObject`, `authenticatorData`, or a COSE
key. This is a WebAuthn primitive, not a general-purpose CBOR codec, and it
decodes only (no encoder).

## Installation

**Deno:**

```bash
deno add @tundralibs/crypt
```

**Bun:**

```bash
bunx jsr add @tundralibs/crypt
```

**Node.js:**

```bash
npx jsr add @tundralibs/crypt
```

## API

### `decodeCBOR(data)`

Decode a single CBOR item that spans the whole buffer (e.g. an
`attestationObject`). Throws `CBORError` on malformed bytes, an unsupported
feature, or trailing bytes.

```typescript
import { decodeCBOR } from '@tundralibs/crypt/cbor';

declare const attestationObject: Uint8Array; // from a WebAuthn ceremony
const decoded = decodeCBOR(attestationObject) as Map<string, unknown>;
const fmt = decoded.get('fmt'); // e.g. "none" | "packed"
const authData = decoded.get('authData') as Uint8Array;
```

### `decodeCBORItem(data, offset?)`

Decode one item starting at `offset`, returning it plus the offset just
past it — for an item embedded in a larger buffer, like the COSE public
key inside `authenticatorData` (which may be followed by CBOR extensions).

```typescript
import { decodeCBORItem } from '@tundralibs/crypt/cbor';

declare const authData: Uint8Array;
declare const credentialPublicKeyOffset: number; // after the fixed fields
const { value: coseKey } = decodeCBORItem(authData, credentialPublicKeyOffset);
```

### `coseToJwk(coseKey)`

Convert a decoded COSE key (a CBOR `Map`) into a Web-Crypto-importable JWK
plus the algorithm it is bound to. Supports EC2 (`ES256`/`ES384`/`ES512`)
and RSA (`RS256`…). The algorithm comes from the COSE `alg` label when
present, otherwise it is derived (from the curve for EC2, defaulting to
`RS256` for RSA).

```typescript
import { coseToJwk, decodeCBORItem } from '@tundralibs/crypt/cbor';

declare const authData: Uint8Array;
declare const offset: number;
declare const signature: BufferSource;
declare const signedBytes: BufferSource;

const { value: coseKey } = decodeCBORItem(authData, offset);
const { jwk, algorithm } = coseToJwk(coseKey); // algorithm e.g. 'ES256'

// import and verify a WebAuthn assertion signature
const key = await crypto.subtle.importKey(
  'jwk',
  jwk,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);
const ok = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  key,
  signature,
  signedBytes,
);
```

## Errors

Every failure throws `CBORError` (extends `BaseError`), carrying the
failing byte `offset` on `context` when the decoder knows it.

---

[← Back to Crypt](../README.md)
