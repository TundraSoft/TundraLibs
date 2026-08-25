/**
 * Password login as the first factor + TOTP as a plain second factor.
 *
 * Pact treats MFA as *secondary verification*, not a login state machine: the
 * seed lives on the stored user, and YOUR app decides when to demand the
 * second step after a successful `login()`. Enroll → generate a code with
 * crypt → verify.
 *
 * Run:
 *   deno run packages/pact/examples/totp-mfa/main.ts
 *   bun run  packages/pact/examples/totp-mfa/main.ts
 *   node --import tsx packages/pact/examples/totp-mfa/main.ts
 */

import { Pact } from '@tundralibs/pact';
import type {
  PactNewUser,
  PactStoredUser,
  PactUserQuery,
} from '@tundralibs/pact/types';
// crypt is a real dependency of pact; its OTP module generates the code a
// user's authenticator app would produce from the same seed.
import { generateTOTP } from '@tundralibs/crypt/OTP';

// ── an in-memory store standing in for YOUR database ──────────────────
const usersById = new Map<string, PactStoredUser>();
const idByIdentifier = new Map<string, string>();
let nextId = 1;

const getUser = (q: PactUserQuery): PactStoredUser | null => {
  if (q.by === 'ID') return usersById.get(q.id) ?? null;
  if (q.by === 'IDENTIFIER') {
    const id = idByIdentifier.get(q.identifier);
    return id !== undefined ? usersById.get(id) ?? null : null;
  }
  return null; // no OAuth in this example
};

const createUser = (draft: PactNewUser): PactStoredUser => {
  const id = `u${nextId++}`;
  // `draft.secret` is ALREADY pbkdf2-hashed by pact — store it verbatim.
  const user: PactStoredUser = {
    id,
    secret: draft.secret,
    grants: draft.grants,
    metadata: draft.metadata,
    status: 'ACTIVE',
  };
  usersById.set(id, user);
  if (draft.identifier !== undefined) idByIdentifier.set(draft.identifier, id);
  return user;
};

// `enrollOtp` calls this with `{ otpSecret }`; merge the patch into the record.
const updateUser = (id: string, patch: Partial<PactStoredUser>): void => {
  const user = usersById.get(id);
  if (user !== undefined) usersById.set(id, { ...user, ...patch });
};

const pact = Pact.create({
  // authorization: module × action over BigInt masks (unused by MFA, but
  // this is the same Pact you already build the rest of your app on)
  bits: { READ: 1n, EDIT: 2n },
  modules: { Post: ['READ', 'EDIT'] },
  // ⚠️ Load this from an env var / secret manager in real code — never
  // hardcode or commit it. HS256 requires ≥ 32 bytes (RFC 7518 §3.2).
  secret: 'dev-only-hs256-secret-change-me!!',
  issuer: 'example-api',
  password: true,
  hooks: { getUser, createUser, updateUser },
});

// ── first factor: register, then a password login ────────────────────
const alice = await pact.register({
  identifier: 'alice@example.com',
  password: 'correct horse battery staple',
  grants: { Post: '3' }, // READ|EDIT
});
console.log('registered', alice.id);

const login = await pact.login('password', {
  identifier: 'alice@example.com',
  password: 'correct horse battery staple',
});
if (login === null) throw new Error('login should have succeeded');
console.log('first factor (password) passed — token issued:', login.token.length > 0);

// ── second factor: enroll for TOTP ───────────────────────────────────
// `enrollOtp` generates a seed, persists it via `updateUser({ otpSecret })`,
// and returns the seed + an otpauth:// URL you would render as a QR code.
const { secret, url } = await pact.enrollOtp(alice.id, {
  accountName: 'alice@example.com',
  issuer: 'example-api',
});
console.log('enrolled — otpauth url starts with:', url.slice(0, 25));

// ⚠️ The TOTP seed is a BEARER SECRET: anyone who reads it can mint valid
// codes. In production keep `otpSecret` OUT of the `by:'ID'` reads you use
// purely to build a principal, and encrypt it at rest (crypt `encryptAES`).
// Here the one store serves both `enrollOtp`/`verifyOtp` and reads, for brevity.

// A real user's authenticator app derives the code from the seed + wall clock.
// crypt does the same: `generateTOTP(seed)` → the current 6-digit code.
const code = await generateTOTP(secret);
console.log('current TOTP code:', code);

// ── verify the second factor ─────────────────────────────────────────
// The app demands this AFTER the password login succeeded — pact does not
// track "half-logged-in" state; `verifyOtp` is a pure yes/no check.
console.log('verifyOtp(valid code)   →', await pact.verifyOtp(alice.id, code)); // true

// A wrong code returns false — never a throw.
console.log('verifyOtp(wrong code)   →', await pact.verifyOtp(alice.id, '000000')); // false

// An unknown / unenrolled user also returns false (no otpSecret on record).
console.log('verifyOtp(unknown user) →', await pact.verifyOtp('nobody', code)); // false
