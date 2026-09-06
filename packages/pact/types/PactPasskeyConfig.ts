/**
 * The `options.passkeys` block — configuring it enables the four passkey
 * ceremony methods and makes their hooks required at construction.
 * Values follow pact's convention of uppercase option enums; pact maps
 * them to the lowercase WebAuthn wire values.
 */
export type PactPasskeyConfig = {
  /** The relying-party id credentials are scoped to (a registrable
   * domain, e.g. `example.com`). */
  rpId: string;
  /** Human-readable relying-party name shown by authenticator UIs. */
  rpName: string;
  /** Exact-match allowed values for the client's `origin`
   * (e.g. `https://app.example.com`). */
  origins: readonly string[];
  /**
   * Server-side stance on user verification (PIN/biometric):
   * `'REQUIRED'` rejects assertions without the UV flag;
   * `'PREFERRED'`/`'DISCOURAGED'` only shape the client hint.
   *
   * @default 'PREFERRED'
   */
  userVerification?: 'REQUIRED' | 'PREFERRED' | 'DISCOURAGED';
  /**
   * Accepted signature algorithms, by JWS name.
   *
   * @default ['ES256', 'RS256']
   */
  algorithms?: readonly ('ES256' | 'RS256')[];
  /**
   * Client-side ceremony timeout hint, in milliseconds.
   *
   * @default 60000
   */
  timeout?: number;
};
