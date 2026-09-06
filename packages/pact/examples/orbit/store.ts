/**
 * Orbit's storage layer — the part YOU write when adopting pact: every
 * hook implemented over in-memory Maps, including honest
 * encrypt-at-rest for the two raw secrets pact hands you (API-key
 * secrets and MFA seeds). Swap the Maps for your database and the
 * contract stays identical.
 */

// Needs a separate install: deno add @tundralibs/crypt
import { decryptAES, encryptAES } from '@tundralibs/crypt/encrypt';
import type {
  PactHooks,
  PactStoredApiKey,
  PactStoredResetToken,
  PactStoredSession,
  PactStoredUser,
} from '@tundralibs/pact';

/** Hold this in env/KMS in a real app — never in source. */
const MASTER_KEY = 'orbit-demo-master-key';

/** Internal row: what the "database" holds. `mfaSecret` is stored
 * ENCRYPTED and only decrypted inside the hooks. */
type UserRow = PactStoredUser & { identifier: string };

const users = new Map<string, UserRow>(); // by id
const byIdentifier = new Map<string, string>(); // identifier -> id
const oauthLinks = new Map<string, string>(); // provider:subject -> id
const sessions = new Map<string, PactStoredSession>();
const resets = new Map<string, PactStoredResetToken>();
const apiKeys = new Map<string, PactStoredApiKey>(); // secret ENCRYPTED
let seq = 0;

/** Decrypt the at-rest fields before a row crosses the hook boundary. */
async function toStoredUser(row: UserRow): Promise<PactStoredUser> {
  return {
    ...row,
    mfaSecret: row.mfaSecret === undefined
      ? undefined
      : await decryptAES(row.mfaSecret, MASTER_KEY),
  };
}

/** The complete bring-your-own-storage implementation. */
export const hooks: PactHooks = {
  getUser: async (query) => {
    let id: string | undefined;
    if (query.by === 'ID') id = query.id;
    else if (query.by === 'IDENTIFIER') id = byIdentifier.get(query.identifier);
    else id = oauthLinks.get(`${query.provider}:${query.subject}`);
    const row = id === undefined ? undefined : users.get(id);
    return row === undefined ? null : await toStoredUser(row);
  },

  createUser: async (input) => {
    const row: UserRow = {
      id: `u${++seq}`,
      identifier: input.identifier,
      status: input.status,
      passwordHash: input.passwordHash,
      grants: input.grants,
      metadata: input.metadata,
    };
    users.set(row.id, row);
    byIdentifier.set(input.identifier, row.id);
    // Persisting the link is what makes future OAUTH queries resolve.
    if (input.oauth !== undefined) {
      oauthLinks.set(`${input.oauth.provider}:${input.oauth.subject}`, row.id);
    }
    return await toStoredUser(row);
  },

  setPassword: (userId, passwordHash) => {
    const row = users.get(userId);
    if (row !== undefined) users.set(userId, { ...row, passwordHash });
  },

  saveSession: (session) => {
    sessions.set(session.id, session);
  },
  getSession: (sessionId) => sessions.get(sessionId) ?? null,
  deleteSession: (sessionId) => {
    sessions.delete(sessionId);
  },
  deleteSessions: (userId) => {
    for (const [id, session] of sessions) {
      if (session.userId === userId) sessions.delete(id);
    }
  },

  saveResetToken: (record) => {
    resets.set(record.id, record);
  },
  consumeResetToken: (id) => {
    // Return AND delete — single use by construction.
    const record = resets.get(id) ?? null;
    resets.delete(id);
    return record;
  },

  saveApiKey: async (key) => {
    // NEVER hash the secret (HMAC needs it back) — encrypt it at rest.
    apiKeys.set(key.id, {
      ...key,
      secret: await encryptAES(key.secret, MASTER_KEY),
    });
  },
  getApiKey: async (keyId) => {
    const key = apiKeys.get(keyId);
    if (key === undefined) return null;
    return { ...key, secret: await decryptAES(key.secret, MASTER_KEY) };
  },
  revokeApiKey: (keyId) => {
    const key = apiKeys.get(keyId);
    if (key !== undefined) apiKeys.set(keyId, { ...key, status: 'REVOKED' });
  },
};

// ── app-side writes pact deliberately does not own ──────────────────

/** Email-verification stand-in: flip a PENDING user to ACTIVE. */
export function activateUser(userId: string): boolean {
  const row = users.get(userId);
  if (row === undefined) return false;
  users.set(userId, { ...row, status: 'ACTIVE' });
  return true;
}

/** Store an MFA seed (encrypted at rest) after enrollment. */
export async function setMfaSecret(
  userId: string,
  seed: string,
): Promise<boolean> {
  const row = users.get(userId);
  if (row === undefined) return false;
  users.set(userId, {
    ...row,
    mfaSecret: await encryptAES(seed, MASTER_KEY),
  });
  return true;
}

/** Look up a user's display identifier (for the MFA otpauth URL). */
export function identifierOf(userId: string): string | undefined {
  return users.get(userId)?.identifier;
}

/** The owning user of an API key — for the ownership check on revoke. */
export function keyOwner(keyId: string): string | undefined {
  return apiKeys.get(keyId)?.userId;
}

/**
 * Replace a user's serialized grants — issuance is the APPLICATION's
 * job (this write), pact only evaluates. Pair every such write with
 * `pact.invalidatePrincipal(userId)` when caching is enabled.
 */
export function setGrants(userId: string, grants: string): boolean {
  const row = users.get(userId);
  if (row === undefined) return false;
  users.set(userId, { ...row, grants });
  return true;
}
