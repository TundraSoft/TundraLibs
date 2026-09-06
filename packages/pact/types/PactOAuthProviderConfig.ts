import type { PactOAuthProviderKind } from './PactOAuthProviderKind.ts';

/**
 * One configured OAuth provider instance. The `oauth` option is a record
 * of instance name → config; the name IS the login-method name, and
 * multiple instances of one kind may coexist.
 */
export type PactOAuthProviderConfig = {
  kind: PactOAuthProviderKind;
  clientId: string;
  /** Absent = public client; the exchange then relies on PKCE alone. */
  clientSecret?: string;
  /** Must EXACTLY match the URI registered with the provider. */
  redirectUri: string;
  /** Overrides the preset's default scopes. */
  scopes?: readonly string[];
  /**
   * `OIDC` kind only: the https issuer used for endpoint discovery and
   * as the id_token trust anchor.
   */
  issuer?: string;
  /**
   * Tenant for tenant-scoped presets (`MICROSOFT`).
   * @default 'common'
   */
  tenant?: string;
  /**
   * id_token availability policy: `'PREFERRED'` degrades to
   * claim-validated decoding when the provider's key set is unreachable;
   * `'REQUIRED'` fails the login instead. Signature and claim failures
   * are fatal under both.
   * @default 'PREFERRED'
   */
  idToken?: 'PREFERRED' | 'REQUIRED';
  /**
   * Create the user on first login via the `createUser` hook. Without it
   * an unlinked identity throws `OAUTH_UNLINKED`.
   */
  autoProvision?: boolean;
  /**
   * Extra authorization-URL params. Cannot override the generated
   * `state`/PKCE/`nonce`/`redirect_uri`.
   */
  authParams?: Record<string, string>;
};
