/**
 * @fileoverview SCRAM-SHA-256 client implementation for Postgres auth.
 *
 * Implements RFC 5802 (SCRAM) with the SHA-256 hash and Postgres's wrapping.
 *
 * Supported mechanisms:
 * - `SCRAM-SHA-256` (Postgres 10+ default)
 * - cleartext password (rare in modern setups; transmitted only over TLS)
 * - AuthenticationOk (no auth needed)
 *
 * Not supported:
 * - MD5 password (Postgres pre-10 default). Web Crypto deprecated MD5; the
 *   driver throws `INVALID_AUTH` if the server requests it. Configure your
 *   Postgres to use `scram-sha-256` in `pg_hba.conf`.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';
import { saslPrep } from './saslprep.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Result of a SCRAM exchange step.
 *
 * The state machine is:
 *
 * - `start()` → produces `clientFirstMessage`, returns context
 * - server replies SASLContinue with serverFirstMessage
 * - `clientFinal(ctx, serverFirstMessage)` → produces clientFinalMessage + serverSignature
 * - server replies SASLFinal with the actual server signature
 * - caller compares them
 */
export type ScramContext = {
  username: string;
  password: string;
  clientNonce: string;
  clientFirstMessageBare: string;
};

/** Generate a 24-byte random nonce, base64-encoded. */
function _generateNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return _bytesToBase64(bytes);
}

/**
 * Begin a SCRAM-SHA-256 exchange.
 *
 * @returns The client first message (to send to the server) and the context
 * needed for the second client message.
 */
export function scramStart(
  username: string,
  password: string,
): { clientFirstMessage: Uint8Array; ctx: ScramContext } {
  const clientNonce = _generateNonce();
  // Postgres ignores the username inside SCRAM (it uses the username from
  // the StartupMessage). The standard SCRAM message still requires a name
  // field, so we emit empty: `n=,r=...`.
  const bare = `n=,r=${clientNonce}`;
  // Channel binding flag: `n,,` = none.
  const fullMessage = `n,,${bare}`;
  return {
    clientFirstMessage: enc.encode(fullMessage),
    ctx: {
      username,
      password,
      clientNonce,
      clientFirstMessageBare: bare,
    },
  };
}

/**
 * Process a SASLContinue payload (server first message) and produce the
 * client final message.
 *
 * @returns The client final message bytes and the expected server signature
 * (caller compares this to the SASLFinal payload).
 *
 * @throws {DriverError} If the server-supplied nonce does not start with our
 *   client nonce, or the server first message is missing `r`/`s`/`i`.
 * @throws {DriverError} If the password contains a code point prohibited by
 *   SASLprep (RFC 4013) or fails its bidirectional check — see
 *   {@link saslPrep}.
 */
export async function scramClientFinal(
  ctx: ScramContext,
  serverFirstMessage: Uint8Array,
): Promise<
  { clientFinalMessage: Uint8Array; expectedServerSignature: string }
> {
  const sfm = dec.decode(serverFirstMessage);
  const attrs = _parseAttributes(sfm);
  const r = attrs.get('r');
  const s = attrs.get('s');
  const i = attrs.get('i');
  if (!r || !s || !i) {
    throw new DriverError(
      'SCRAM: server first message missing r/s/i',
      { stage: 'scram-client-final' },
    );
  }
  if (!r.startsWith(ctx.clientNonce)) {
    throw new DriverError(
      'SCRAM: server nonce does not extend client nonce',
      { stage: 'scram-client-final' },
    );
  }
  const salt = _base64ToBytes(s);
  const iterations = Number.parseInt(i, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new DriverError(
      `SCRAM: invalid iterations "${i}"`,
      { stage: 'scram-client-final', iterations: i },
    );
  }

  // Per RFC 5802:
  //   SaltedPassword = Hi(Normalize(password), salt, i)
  //   ClientKey      = HMAC(SaltedPassword, "Client Key")
  //   StoredKey      = SHA-256(ClientKey)
  //   AuthMessage    = client-first-message-bare + "," +
  //                    server-first-message + "," +
  //                    client-final-message-without-proof
  //   ClientSignature = HMAC(StoredKey, AuthMessage)
  //   ClientProof    = ClientKey XOR ClientSignature
  //   ServerKey      = HMAC(SaltedPassword, "Server Key")
  //   ServerSignature = HMAC(ServerKey, AuthMessage)

  // SaltedPassword = Hi(Normalize(password), salt, i). `Normalize` is the
  // SASLprep profile (RFC 4013): without it, any non-ASCII / NFKC-normalizable
  // password derives a different key than a spec-compliant server and auth
  // fails.
  //
  // `saslPrep` THROWS on a prohibited code point or a bidi violation. But
  // PostgreSQL's server (pg_saslprep, via scram_build_secret) and libpq both
  // FALL BACK to the RAW password when SASLprep fails, rather than rejecting —
  // so for such a password the stored verifier is derived from the raw bytes.
  // Mirror that fallback: attempt SASLprep, but on failure use the raw
  // password. Throwing here instead would lock out credentials that
  // PostgreSQL (and the previous, non-normalizing driver release) accept —
  // e.g. a right-to-left password ending in an ASCII digit, or one containing
  // a control character.
  let normalizedPassword: string;
  try {
    normalizedPassword = saslPrep(ctx.password);
  } catch {
    normalizedPassword = ctx.password;
  }
  const saltedPassword = await _pbkdf2Sha256(
    enc.encode(normalizedPassword),
    salt,
    iterations,
    32,
  );
  const clientKey = await _hmacSha256(saltedPassword, enc.encode('Client Key'));
  const storedKey = await _sha256(clientKey);

  const channelBindingHeader = 'biws'; // base64("n,,")
  const clientFinalNoProof = `c=${channelBindingHeader},r=${r}`;
  const authMessage =
    `${ctx.clientFirstMessageBare},${sfm},${clientFinalNoProof}`;
  const authBytes = enc.encode(authMessage);
  const clientSignature = await _hmacSha256(storedKey, authBytes);
  const clientProof = _xor(clientKey, clientSignature);
  const clientFinalMessage = `${clientFinalNoProof},p=${
    _bytesToBase64(clientProof)
  }`;

  const serverKey = await _hmacSha256(saltedPassword, enc.encode('Server Key'));
  const serverSignature = await _hmacSha256(serverKey, authBytes);
  const expectedServerSignature = _bytesToBase64(serverSignature);

  return {
    clientFinalMessage: enc.encode(clientFinalMessage),
    expectedServerSignature,
  };
}

/**
 * Verify a SASLFinal payload — must contain `v=<expected>`.
 *
 * Both signatures are base64-decoded and compared with a constant-time
 * loop: a plain `===` on the base64 strings leaks how many leading
 * characters match through its early-exit, which is an oracle on the
 * server signature. SCRAM's `v` is a MAC, so timing-safe comparison
 * keeps an attacker from forging it byte-by-byte.
 */
export function scramVerifyFinal(
  expectedSignature: string,
  saslFinalPayload: Uint8Array,
): boolean {
  const text = dec.decode(saslFinalPayload);
  const attrs = _parseAttributes(text);
  const actual = attrs.get('v');
  if (actual === undefined) return false;
  let expectedBytes: Uint8Array;
  let actualBytes: Uint8Array;
  try {
    expectedBytes = _base64ToBytes(expectedSignature);
    actualBytes = _base64ToBytes(actual);
  } catch {
    // Malformed base64 — treat as mismatch rather than throwing.
    return false;
  }
  return _timingSafeEqual(expectedBytes, actualBytes);
}

/**
 * Constant-time byte comparison. Always walks the full length of the
 * longer input so the time taken does not reveal where two values
 * first differ.
 */
function _timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

//#region Crypto primitives (Web Crypto)

// deno-lint-ignore no-explicit-any
const _bs = (u: Uint8Array): any => u; // BufferSource cast

async function _pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  outputLength: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    _bs(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: _bs(salt),
      iterations,
    },
    key,
    outputLength * 8,
  );
  return new Uint8Array(bits);
}

async function _hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    _bs(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, _bs(data));
  return new Uint8Array(signature);
}

async function _sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', _bs(data));
  return new Uint8Array(digest);
}

function _xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new DriverError(
      `SCRAM XOR length mismatch: ${a.length} vs ${b.length}`,
      { stage: 'scram-xor', aLength: a.length, bLength: b.length },
    );
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! ^ b[i]!;
  return out;
}

//#endregion Crypto primitives

//#region Encoding helpers

function _bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

function _base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Parse a SCRAM message (`a=b,c=d,...`) into a key→value map.
 * Tolerates `=` in values (only the first `=` is treated as the separator).
 */
function _parseAttributes(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of text.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return map;
}

//#endregion Encoding helpers
