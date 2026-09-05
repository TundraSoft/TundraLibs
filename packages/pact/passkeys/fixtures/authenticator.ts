/**
 * @fileoverview Test-only synthetic authenticator: builds spec-shaped
 * WebAuthn registration and assertion payloads with real WebCrypto
 * keys, including a minimal CBOR encoder (pact only decodes) and a
 * raw→DER ECDSA signature converter (real authenticators emit DER;
 * WebCrypto emits raw). Imported by test files only — the fixtures
 * directory is outside test discovery on every runtime and excluded
 * from the published tarball.
 *
 * @module
 */
import { decodeBase64Url, encodeBase64Url } from '@std/encoding';

// ── minimal CBOR encoder (maps, byte/text strings, ints) ────────────

function cborUint(major: number, value: number): number[] {
  if (value < 24) return [(major << 5) | value];
  if (value < 256) return [(major << 5) | 24, value];
  if (value < 65536) return [(major << 5) | 25, value >> 8, value & 0xff];
  return [
    (major << 5) | 26,
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

export function cborEncode(value: unknown): Uint8Array {
  const out: number[] = [];
  encodeInto(value, out);
  return new Uint8Array(out);
}

function encodeInto(value: unknown, out: number[]): void {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 0) out.push(...cborUint(0, value));
    else out.push(...cborUint(1, -1 - value));
    return;
  }
  if (value instanceof Uint8Array) {
    out.push(...cborUint(2, value.length), ...value);
    return;
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    out.push(...cborUint(3, bytes.length), ...bytes);
    return;
  }
  if (value instanceof Map) {
    out.push(...cborUint(5, value.size));
    for (const [k, v] of value) {
      encodeInto(k, out);
      encodeInto(v, out);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    out.push(...cborUint(5, entries.length));
    for (const [k, v] of entries) {
      encodeInto(k, out);
      encodeInto(v, out);
    }
    return;
  }
  throw new Error(`fixture cannot encode ${String(value)}`);
}

// ── raw → DER ECDSA signature (inverse of crypt's ecdsaDerToRaw) ────

function derInteger(bytes: Uint8Array): number[] {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const trimmed = bytes.slice(start);
  const needsPad = (trimmed[0]! & 0x80) !== 0;
  const body = needsPad ? [0, ...trimmed] : [...trimmed];
  return [0x02, body.length, ...body];
}

export function ecdsaRawToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const r = derInteger(raw.slice(0, half));
  const s = derInteger(raw.slice(half));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

// ── the authenticator ───────────────────────────────────────────────

const FLAGS = { UP: 0x01, UV: 0x04, AT: 0x40 } as const;

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', data as BufferSource),
  );
}

function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

export type FixtureAuthenticator = {
  readonly credentialId: string;
  registrationResponse(input: {
    challenge: string;
    origin: string;
    rpId?: string;
    flags?: number;
    signCount?: number;
    type?: string;
  }): Promise<{
    id: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
      transports?: readonly string[];
    };
  }>;
  assertionResponse(input: {
    challenge: string;
    origin: string;
    rpId?: string;
    flags?: number;
    signCount: number;
    type?: string;
    userHandle?: string;
    tamper?: boolean;
  }): Promise<{
    id: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
  }>;
};

/**
 * Create a synthetic authenticator holding one fresh keypair.
 * `algorithm` picks the credential type; defaults ES256.
 */
export async function createAuthenticator(
  rpId: string,
  algorithm: 'ES256' | 'RS256' = 'ES256',
): Promise<FixtureAuthenticator> {
  const keys = algorithm === 'ES256'
    ? await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    : await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const credentialIdBytes = crypto.getRandomValues(new Uint8Array(16));
  const credentialId = encodeBase64Url(credentialIdBytes);
  const rpIdHash = await sha256(new TextEncoder().encode(rpId));

  const cosePublicKey = algorithm === 'ES256'
    ? new Map<number, unknown>([
      [1, 2], // kty EC2
      [3, -7], // alg ES256
      [-1, 1], // crv P-256
      [-2, decodeBase64Url(jwk.x!)],
      [-3, decodeBase64Url(jwk.y!)],
    ])
    : new Map<number, unknown>([
      [1, 3], // kty RSA
      [3, -257], // alg RS256
      [-1, decodeBase64Url(jwk.n!)],
      [-2, decodeBase64Url(jwk.e!)],
    ]);

  function clientData(type: string, challenge: string, origin: string): {
    encoded: string;
    bytes: Uint8Array;
  } {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ type, challenge, origin }),
    );
    return { encoded: encodeBase64Url(bytes), bytes };
  }

  async function sign(data: Uint8Array): Promise<Uint8Array> {
    if (algorithm === 'ES256') {
      const raw = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keys.privateKey,
          data as BufferSource,
        ),
      );
      return ecdsaRawToDer(raw); // real authenticators emit DER
    }
    return new Uint8Array(
      await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keys.privateKey,
        data as BufferSource,
      ),
    );
  }

  return {
    credentialId,
    async registrationResponse(input) {
      const hash = input.rpId === undefined
        ? rpIdHash
        : await sha256(new TextEncoder().encode(input.rpId));
      const flags = input.flags ?? (FLAGS.UP | FLAGS.UV | FLAGS.AT);
      const authData = new Uint8Array([
        ...hash,
        flags,
        ...u32(input.signCount ?? 0),
        ...new Uint8Array(16), // aaguid
        (credentialIdBytes.length >> 8) & 0xff,
        credentialIdBytes.length & 0xff,
        ...credentialIdBytes,
        ...cborEncode(cosePublicKey),
      ]);
      const attestationObject = cborEncode(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      );
      return {
        id: credentialId,
        response: {
          clientDataJSON: clientData(
            input.type ?? 'webauthn.create',
            input.challenge,
            input.origin,
          ).encoded,
          attestationObject: encodeBase64Url(attestationObject),
          transports: ['internal'],
        },
      };
    },
    async assertionResponse(input) {
      const hash = input.rpId === undefined
        ? rpIdHash
        : await sha256(new TextEncoder().encode(input.rpId));
      const flags = input.flags ?? (FLAGS.UP | FLAGS.UV);
      const authData = new Uint8Array([
        ...hash,
        flags,
        ...u32(input.signCount),
      ]);
      const client = clientData(
        input.type ?? 'webauthn.get',
        input.challenge,
        input.origin,
      );
      const signed = new Uint8Array([
        ...authData,
        ...await sha256(client.bytes),
      ]);
      const signature = await sign(signed);
      if (input.tamper === true) signature[8]! ^= 0xff;
      return {
        id: credentialId,
        response: {
          clientDataJSON: client.encoded,
          authenticatorData: encodeBase64Url(authData),
          signature: encodeBase64Url(signature),
          ...(input.userHandle === undefined ? {} : {
            userHandle: encodeBase64Url(
              new TextEncoder().encode(input.userHandle),
            ),
          }),
        },
      };
    },
  };
}
