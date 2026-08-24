/**
 * @fileoverview Extracted-credential union for `@tundralibs/pact` — what
 * `Pact.authenticate` checks. pact never parses headers or cookies: the
 * framework extracts the values (splits `Authorization`, decodes Basic
 * base64, picks the cookie, canonicalizes the HMAC payload) and passes
 * them along; pact only handles the checks and validation.
 *
 * @module
 */

/** One extracted credential, discriminated by scheme. */
export type PactCredential =
  | {
    /** Basic auth — identifier + password, pbkdf2-verified via `getUser`. */
    scheme: 'BASIC';
    identifier: string;
    password: string;
  }
  | {
    /** A pact-issued session token (JWT or opaque, per `session` config). */
    scheme: 'BEARER';
    token: string;
  }
  | {
    /** Simple static token — sha-256 hashed, looked up via `getToken`. */
    scheme: 'TOKEN';
    token: string;
  }
  | {
    /** API key pair — `secret` sha-256-compared against the stored hash. */
    scheme: 'APIKEY';
    keyId: string;
    secret: string;
  }
  | {
    /**
     * Request signature — verified against the key's stored `secret` via
     * crypt HMAC. The framework decides WHAT was signed (raw body, a
     * canonical string) and passes it as `payload`.
     */
    scheme: 'HMAC';
    keyId: string;
    signature: string;
    payload: string | Uint8Array;
  };
