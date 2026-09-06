/**
 * One registered passkey (WebAuthn credential) as the app stores it —
 * a user may hold several, one per authenticator. Nothing here is
 * secret: the public key verifies assertions, it cannot mint them.
 */
export type PactStoredPasskey = {
  /** The credential id (base64url) — the lookup key. */
  readonly id: string;
  /** The user this passkey signs in. */
  readonly userId: string;
  /** JSON-serialized JWK public key, as produced at registration. */
  readonly publicKey: string;
  /** Signature algorithm, by JWS name. */
  readonly algorithm: 'ES256' | 'RS256';
  /** Last accepted signature counter (0 for synced passkeys). */
  readonly signCount: number;
  /** Authenticator transports reported at registration — echoed into
   * `allowCredentials` to improve browser UX. */
  readonly transports?: readonly string[];
  /** App-owned bag (device label, created-at, ...). */
  readonly metadata?: Readonly<Record<string, unknown>>;
};
