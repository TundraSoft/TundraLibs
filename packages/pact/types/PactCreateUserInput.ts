import type { PactOAuthProfile } from './PactOAuthProfile.ts';

/**
 * Input to the `createUser` hook (register sugar and OAuth
 * auto-provisioning). The password, when present, arrives ALREADY
 * pbkdf2-hashed and grants arrive serialized — the application persists
 * the record and returns the stored form.
 */
export type PactCreateUserInput = {
  readonly identifier: string;
  /** App-defined lifecycle status for the new record. */
  readonly status: string;
  readonly passwordHash?: string;
  /** Serialized per-module grants (see `serializeGrants`). */
  readonly grants: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * OAuth auto-provisioning only: the verified identity. The application
   * MUST persist the provider/subject link — that is what makes its own
   * future `getUser({ by: 'OAUTH' })` queries resolve.
   */
  readonly oauth?: {
    readonly provider: string;
    readonly subject: string;
    readonly profile: PactOAuthProfile;
  };
};
