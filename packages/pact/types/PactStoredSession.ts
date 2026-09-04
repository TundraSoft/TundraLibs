/**
 * A minted opaque session, keyed by the sha-256 of the session token —
 * the raw token is shown once at login and never stored. Without the
 * session hooks the record lives only in the session cache (single
 * process, lost on restart); with them the application store is
 * authoritative.
 */
export type PactStoredSession = {
  /** sha-256 of the session token — the lookup key. */
  readonly id: string;
  /** The user this session belongs to. */
  readonly userId: string;
  /** Absolute expiry; sessions never slide. */
  readonly expiresAt: Date;
  /** App-owned bag (device info, ip, …). */
  readonly metadata?: Readonly<Record<string, unknown>>;
};
