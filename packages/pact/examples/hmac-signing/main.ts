/**
 * HMAC request signing (inbound) + content signing (outbound).
 *
 * Two mirror-image HMAC flows on ONE pact instance:
 *   1. `authenticate({ scheme: 'HMAC' })` verifies a signature a CLIENT
 *      produced against the key's stored signing secret.
 *   2. `sign()` / `verifySignature()` sign content YOUR api emits (a webhook
 *      body) and check it on the way back.
 * Both are backed by an in-memory store — swap the `hooks` for your database.
 *
 * Run:
 *   deno run packages/pact/examples/hmac-signing/main.ts
 *   bun run  packages/pact/examples/hmac-signing/main.ts
 *   node --import tsx packages/pact/examples/hmac-signing/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type {
  PactStoredApiKey,
  PactStoredUser,
  PactUserQuery,
} from '@tundralibs/pact/types';
// The CLIENT side signs with crypt directly — pact never sees the client's
// code, only the resulting signature. crypt is a real pact dependency, so
// this specifier resolves for consumers too.
import { signHMAC } from '@tundralibs/crypt/sign';

// ── an in-memory store standing in for YOUR database ──────────────────
const users = new Map<string, PactStoredUser>([
  ['u1', { id: 'u1', grants: { Webhook: '1' }, status: 'ACTIVE' }],
]);
// An HMAC api-key MUST store the RAW `secret` (not just a hash): verification
// recomputes the signature, so a hash-only key cannot verify. Encrypt it at
// rest in real code (crypt `encryptAES`).
const SHARED_SECRET = 'shared-signing-secret-for-key-k1';
const apiKeys = new Map<string, PactStoredApiKey>([
  ['k1', { id: 'k1', userId: 'u1', secret: SHARED_SECRET }],
]);

const getUser = (q: PactUserQuery): PactStoredUser | null =>
  q.by === 'ID' ? users.get(q.id) ?? null : null;
const getApiKey = (keyId: string): PactStoredApiKey | null =>
  apiKeys.get(keyId) ?? null;

const pact = Pact.create({
  // authorization: module × action over BigInt masks
  bits: { CALL: 1n },
  modules: { Webhook: ['CALL'] },
  // ⚠️ Load from an env var / secret manager in real code — never commit it.
  // HS256 requires ≥ 32 bytes (RFC 7518 §3.2). Used for content signing below.
  secret: 'dev-only-hs256-secret-change-me!!',
  apiKeys: true, // enables the APIKEY + HMAC schemes
  hooks: { getUser, getApiKey },
});

// ── 1) INBOUND: verify a client's HMAC-signed request ─────────────────
// The framework decides WHAT gets signed and passes it as `payload`. Fold a
// timestamp and a nonce into it: pact verifies the signature but cannot see
// freshness inside an opaque payload, so replay defense is the app's job —
// reject stale timestamps and remember recently-seen nonces.
const canonical = (nonce: string) =>
  JSON.stringify({
    method: 'POST',
    path: '/webhooks/order',
    ts: '2026-08-25T10:00:00Z',
    nonce,
    body: { orderId: 42 },
  });

const payload = canonical('nonce-abc');
// The client signs with the shared secret it was issued (SHA-256 default,
// matching pact's verification).
const signature = await signHMAC(payload, SHARED_SECRET);

// Valid signature → principal.
const principal = await pact.authenticate({
  scheme: 'HMAC',
  keyId: 'k1',
  signature,
  payload,
});
console.log('valid signature → principal', principal?.id, principal?.status);
console.log('can CALL Webhook?', pact.can(principal, 'Webhook', 'CALL')); // true

// Tampered payload (same signature) → null. The recomputed signature no
// longer matches, so pact rejects it — uniformly, never a throw.
const tampered = await pact.authenticate({
  scheme: 'HMAC',
  keyId: 'k1',
  signature,
  payload: canonical('nonce-xyz'), // body/nonce changed after signing
});
console.log('tampered payload →', tampered); // null

// Unknown key id → null (no such secret to verify against).
console.log(
  'unknown key →',
  await pact.authenticate({ scheme: 'HMAC', keyId: 'nope', signature, payload }),
); // null

// ── 2) OUTBOUND: sign content your api emits ──────────────────────────
// A webhook body you send to a subscriber, signed so they can verify origin.
const webhookBody = JSON.stringify({ event: 'order.paid', orderId: 42 });
const bodySig = await pact.sign(webhookBody); // ship in an X-Signature header

// Round-trip: the subscriber (holding the same secret) verifies → true.
console.log('signature round-trips →', await pact.verifySignature(webhookBody, bodySig));

// A garbled signature → false, never a throw — an attacker-supplied header
// can't 500 the verifier.
console.log('garbled signature →', await pact.verifySignature(webhookBody, 'not-a-real-signature'));

// With no explicit `key`, the content-signing key is HKDF-derived from
// `secret` under a distinct domain label — NOT the raw JWT signing secret.
// So content you sign here can never be replayed as a valid JWT signature,
// even though both are HMAC under the same configured `secret`.
console.log('done');
