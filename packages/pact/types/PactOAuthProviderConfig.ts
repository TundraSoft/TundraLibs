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
   * `OIDC` kind only: hosts besides the issuer's own (and its
   * subdomains) that the discovery document may point an endpoint at,
   * as lowercase hostnames — e.g. `['oauth2.googleapis.com',
   * 'www.googleapis.com']` for Google's split hosts. A discovered
   * authorization, token, userinfo or JWKS endpoint anywhere else fails
   * the flow with `OAUTH_EXCHANGE_FAILED`.
   */
  discoveryHosts?: readonly string[];
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
   * Which of this provider's addresses count as verified: `'CLAIM'` takes
   * the provider's own flag (Google's `email_verified`, GitHub's verified
   * primary address), `'ALWAYS'` trusts every address it returns — only
   * for an IdP whose users' domains you control, such as one tenant's own
   * SSO with tenant-scoped identifiers — and `'NEVER'` trusts none. A
   * verified address becomes the provisioned identifier and may link an
   * existing account (`linkVerifiedEmail`).
   * @default 'CLAIM'
   */
  emailTrust?: 'CLAIM' | 'ALWAYS' | 'NEVER';
  /**
   * On a first login whose verified address matches an existing local
   * identifier, link the identity to that account through the `linkOAuth`
   * hook instead of failing with `USER_EXISTS`. Safe only as far as
   * `emailTrust` is: whoever controls a verified address gets its
   * account.
   */
  linkVerifiedEmail?: boolean;
  /**
   * Extra authorization-URL params. Cannot override the generated
   * `state`/PKCE/`nonce`/`redirect_uri`.
   */
  authParams?: Record<string, string>;
};
