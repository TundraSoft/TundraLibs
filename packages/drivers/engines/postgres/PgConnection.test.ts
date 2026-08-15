/**
 * @fileoverview Handshake tests for {@link PgConnection}.
 *
 * These drive `connect()` against an in-memory mock server (no live
 * Postgres) so the SCRAM-SHA-256 exchange — including the mandatory
 * mutual-auth server-signature verification — can be exercised
 * deterministically. The mock speaks just enough of the backend protocol
 * to complete (or deliberately sabotage) the SASL exchange.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { Connection } from '@tundralibs/compat';
import { PgConnection } from './PgConnection.ts';
import { EngineError } from '../../errors/mod.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

// BufferSource cast — Uint8Array is a valid BufferSource at runtime, but the
// cross-runtime lib types disagree on ArrayBufferLike vs ArrayBuffer. Mirrors
// the `_bs` helper in auth.ts.
// deno-lint-ignore no-explicit-any
const bs = (u: Uint8Array): any => u;

// =============================================================================
// Backend-message framing helpers (server → client)
// =============================================================================

/** Frame a typed backend message: `type(1) + len(4, incl. len) + payload`. */
function frame(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 4 + payload.length);
  out[0] = type.charCodeAt(0);
  new DataView(out.buffer).setUint32(1, payload.length + 4, false);
  out.set(payload, 5);
  return out;
}

/** `R` (Authentication) message with the given 4-byte code + optional data. */
function authFrame(
  code: number,
  data: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const payload = new Uint8Array(4 + data.length);
  new DataView(payload.buffer).setUint32(0, code, false);
  payload.set(data, 4);
  return frame('R', payload);
}

/** AuthenticationSASL (code 10): mechanism list, null-terminated, final null. */
function authSasl(): Uint8Array {
  const mech = enc.encode('SCRAM-SHA-256\0');
  const data = new Uint8Array(mech.length + 1); // trailing null terminates list
  data.set(mech, 0);
  return authFrame(10, data);
}
const authSaslContinue = (serverFirst: string) =>
  authFrame(11, enc.encode(serverFirst));
const authSaslFinal = (v: string) => authFrame(12, enc.encode(`v=${v}`));
const authOk = () => authFrame(0);
const readyForQuery = () => frame('Z', enc.encode('I'));

// =============================================================================
// Server-side SCRAM crypto (mirrors auth.ts, server half)
// =============================================================================

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    bs(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, bs(data)));
}

async function pbkdf2(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    bs(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bs(salt), iterations },
    key,
    32 * 8,
  );
  return new Uint8Array(bits);
}

/** Compute the base64 ServerSignature the server returns in SASLFinal. */
async function serverSignature(
  password: string,
  salt: Uint8Array,
  iterations: number,
  authMessage: string,
): Promise<string> {
  const saltedPassword = await pbkdf2(enc.encode(password), salt, iterations);
  const serverKey = await hmacSha256(saltedPassword, enc.encode('Server Key'));
  const sig = await hmacSha256(serverKey, enc.encode(authMessage));
  return bytesToBase64(sig);
}

// =============================================================================
// Mock server / Connection
// =============================================================================

type ServerMode = 'honest' | 'skip-final' | 'wrong-signature';

/**
 * A minimal in-memory {@link Connection} that plays the Postgres server side
 * of a SCRAM-SHA-256 handshake. The `mode` decides how the SASLFinal step is
 * handled — honest, omitted (a rogue server jumps straight to
 * AuthenticationOk), or tampered (wrong server signature).
 */
class ScramMockServer implements Connection {
  private __chunks: Uint8Array[] = [];
  private __pending: ((v: Uint8Array | null) => void) | null = null;
  private __step = 0;
  private __clientFirstBare = '';
  private __serverFirst = '';
  private readonly __salt = new Uint8Array([
    9,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    1,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
  ]);
  private readonly __iterations = 4096;
  private readonly __serverNonce = 'c2VydmVyLW5vbmNlLXZhbHVl';

  constructor(
    private readonly __mode: ServerMode,
    private readonly __password: string,
  ) {}

  read(): Promise<Uint8Array | null> {
    const next = this.__chunks.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => {
      this.__pending = resolve;
    });
  }

  async write(data: Uint8Array | string): Promise<number> {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    await this.__handle(bytes);
    return bytes.length;
  }

  close(): void {}

  private __push(chunk: Uint8Array): void {
    if (this.__pending) {
      const p = this.__pending;
      this.__pending = null;
      p(chunk);
    } else {
      this.__chunks.push(chunk);
    }
  }

  private async __handle(bytes: Uint8Array): Promise<void> {
    if (this.__step === 0) {
      // StartupMessage → request SASL.
      this.__step = 1;
      this.__push(authSasl());
      return;
    }
    if (this.__step === 1) {
      // SASLInitialResponse ('p'): mechanism\0 + int32 len + client-first.
      const payload = bytes.subarray(5);
      let i = 0;
      while (payload[i] !== 0) i++;
      const clientFirst = dec.decode(payload.subarray(i + 1 + 4));
      this.__clientFirstBare = clientFirst.slice(3); // strip "n,," gs2 header
      const clientNonce = this.__clientFirstBare.split('r=')[1]!;
      this.__serverFirst = `r=${clientNonce}${this.__serverNonce},s=${
        bytesToBase64(this.__salt)
      },i=${this.__iterations}`;
      this.__step = 2;
      this.__push(authSaslContinue(this.__serverFirst));
      return;
    }
    // step 2: SASLResponse ('p') carrying the client-final message.
    const clientFinal = dec.decode(bytes.subarray(5));
    const clientFinalNoProof = clientFinal.slice(0, clientFinal.indexOf(',p='));
    const authMessage =
      `${this.__clientFirstBare},${this.__serverFirst},${clientFinalNoProof}`;

    if (this.__mode === 'skip-final') {
      // Rogue: never send SASLFinal — jump straight to AuthenticationOk.
      this.__push(authOk());
      this.__push(readyForQuery());
      return;
    }
    const good = await serverSignature(
      this.__password,
      this.__salt,
      this.__iterations,
      authMessage,
    );
    const v = this.__mode === 'wrong-signature'
      ? bytesToBase64(new Uint8Array(32)) // all-zero → wrong signature
      : good;
    this.__push(authSaslFinal(v));
    this.__push(authOk());
    this.__push(readyForQuery());
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('drivers.postgres.PgConnection.connect (SCRAM mutual auth)', () => {
  const PASSWORD = 'correct horse battery staple';

  it('rejects a server that skips SASLFinal and jumps to AuthenticationOk', async () => {
    const conn = new PgConnection(
      new ScramMockServer('skip-final', PASSWORD),
      undefined,
      'test-instance',
    );
    const err = await asserts.assertRejects(
      () => conn.connect({ user: 'app', database: 'app', password: PASSWORD }),
      EngineError,
    );
    asserts.assertStrictEquals((err as EngineError).code, 'INVALID_AUTH');
  });

  it('rejects a server that returns a tampered server signature', async () => {
    const conn = new PgConnection(
      new ScramMockServer('wrong-signature', PASSWORD),
      undefined,
      'test-instance',
    );
    const err = await asserts.assertRejects(
      () => conn.connect({ user: 'app', database: 'app', password: PASSWORD }),
      EngineError,
    );
    asserts.assertStrictEquals((err as EngineError).code, 'INVALID_AUTH');
  });

  it('accepts an honest server that proves the server signature', async () => {
    const conn = new PgConnection(
      new ScramMockServer('honest', PASSWORD),
      undefined,
      'test-instance',
    );
    // Must resolve — the fix must not reject a correct mutual-auth handshake.
    await conn.connect({ user: 'app', database: 'app', password: PASSWORD });
    asserts.assertStrictEquals(conn.txStatus, 'I');
  });
});

// =============================================================================
// Round-3 finding #1: a transport error (rejected read/write) must mark the
// connection closed, so the pool's `_validateResource` (`!conn.closed`)
// rejects it and destroys it rather than recycling a dead socket.
// =============================================================================

/** A {@link Connection} whose read (or write) rejects with a socket error. */
class RejectingConn implements Connection {
  constructor(private readonly __mode: 'read' | 'write') {}
  read(): Promise<Uint8Array | null> {
    if (this.__mode === 'read') {
      return Promise.reject(new Error('ECONNRESET'));
    }
    // In 'write' mode the write rejects first, so read is never reached.
    return new Promise(() => {});
  }
  write(_data: Uint8Array | string): Promise<number> {
    if (this.__mode === 'write') return Promise.reject(new Error('EPIPE'));
    return Promise.resolve(0);
  }
  close(): void {}
}

describe('drivers.postgres.PgConnection transport-error handling', () => {
  it('marks the connection closed when a write rejects', async () => {
    const conn = new PgConnection(
      new RejectingConn('write'),
      undefined,
      'test-instance',
    );
    asserts.assertStrictEquals(conn.closed, false);
    await asserts.assertRejects(
      () => conn.connect({ user: 'app', database: 'app', password: 'x' }),
    );
    // Previously stayed false — so `_validateResource` re-served the corpse.
    asserts.assertStrictEquals(conn.closed, true);
  });

  it('marks the connection closed when a read rejects', async () => {
    const conn = new PgConnection(
      new RejectingConn('read'),
      undefined,
      'test-instance',
    );
    asserts.assertStrictEquals(conn.closed, false);
    await asserts.assertRejects(
      () => conn.connect({ user: 'app', database: 'app', password: 'x' }),
    );
    asserts.assertStrictEquals(conn.closed, true);
  });
});

// =============================================================================
// Round-3 finding #8: a rogue/MITM server can request cleartext-password auth
// to harvest the password over an unencrypted connection. The driver must
// refuse cleartext over a non-TLS socket unless explicitly opted in.
// =============================================================================

/** A minimal server that asks for a cleartext password, then accepts. */
class CleartextMockServer implements Connection {
  private __chunks: Uint8Array[] = [];
  private __pending: ((v: Uint8Array | null) => void) | null = null;
  private __step = 0;

  read(): Promise<Uint8Array | null> {
    const next = this.__chunks.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => {
      this.__pending = resolve;
    });
  }
  async write(data: Uint8Array | string): Promise<number> {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    await this.__handle(bytes);
    return bytes.length;
  }
  close(): void {}

  private __push(chunk: Uint8Array): void {
    if (this.__pending) {
      const p = this.__pending;
      this.__pending = null;
      p(chunk);
    } else {
      this.__chunks.push(chunk);
    }
  }
  private __handle(_bytes: Uint8Array): void {
    if (this.__step === 0) {
      // StartupMessage → AuthenticationCleartextPassword (auth code 3).
      this.__step = 1;
      this.__push(authFrame(3));
      return;
    }
    // PasswordMessage received → accept.
    this.__push(authOk());
    this.__push(readyForQuery());
  }
}

describe('drivers.postgres.PgConnection cleartext-auth downgrade guard', () => {
  // Round-4 finding #4: refusing by default is a breaking change for every
  // working `pg_hba ... password` / PgBouncer `auth_type = plain` deployment,
  // shipped under a routine `fix:`. The default is therefore permissive (what
  // libpq does unless `require_auth` is pinned) but LOUD, and strictness is an
  // explicit opt-in via `allowCleartextPassword: false`.
  it('sends the password by default (does not break plaintext deployments)', async () => {
    const conn = new PgConnection(
      new CleartextMockServer(),
      undefined,
      'test-instance',
    );
    await conn.connect({
      user: 'app',
      database: 'app',
      password: 'secret',
      tlsActive: false,
    });
    asserts.assertStrictEquals(conn.txStatus, 'I');
  });

  it('emits a loud notice when cleartext goes over an unencrypted socket', async () => {
    const notices: string[] = [];
    const conn = new PgConnection(
      new CleartextMockServer(),
      (m) => notices.push(m),
      'test-instance',
    );
    await conn.connect({
      user: 'app',
      database: 'app',
      password: 'secret',
      tlsActive: false,
    });
    asserts.assertStrictEquals(notices.length, 1);
    asserts.assertStringIncludes(notices[0]!, 'WARNING');
    asserts.assertStringIncludes(notices[0]!, 'cleartext');
    asserts.assertStringIncludes(notices[0]!, 'allowCleartextPassword');
  });

  it('refuses cleartext over plaintext when explicitly pinned off', async () => {
    const conn = new PgConnection(
      new CleartextMockServer(),
      undefined,
      'test-instance',
    );
    const err = await asserts.assertRejects(
      () =>
        conn.connect({
          user: 'app',
          database: 'app',
          password: 'secret',
          tlsActive: false,
          allowCleartextPassword: false,
        }),
      EngineError,
    );
    asserts.assertStrictEquals((err as EngineError).code, 'INVALID_AUTH');
  });

  it('allows cleartext auth when explicitly opted in', async () => {
    const conn = new PgConnection(
      new CleartextMockServer(),
      undefined,
      'test-instance',
    );
    await conn.connect({
      user: 'app',
      database: 'app',
      password: 'secret',
      tlsActive: false,
      allowCleartextPassword: true,
    });
    asserts.assertStrictEquals(conn.txStatus, 'I');
  });

  it('allows cleartext over TLS silently — the transport is encrypted', async () => {
    const notices: string[] = [];
    const conn = new PgConnection(
      new CleartextMockServer(),
      (m) => notices.push(m),
      'test-instance',
    );
    await conn.connect({
      user: 'app',
      database: 'app',
      password: 'secret',
      tlsActive: true,
    });
    asserts.assertStrictEquals(conn.txStatus, 'I');
    asserts.assertStrictEquals(notices.length, 0);
  });

  it('allows cleartext over TLS even when pinned off — TLS satisfies it', async () => {
    const conn = new PgConnection(
      new CleartextMockServer(),
      undefined,
      'test-instance',
    );
    await conn.connect({
      user: 'app',
      database: 'app',
      password: 'secret',
      tlsActive: true,
      allowCleartextPassword: false,
    });
    asserts.assertStrictEquals(conn.txStatus, 'I');
  });
});
