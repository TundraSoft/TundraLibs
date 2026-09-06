/**
 * One per-request credential, EXTRACTED by the framework adapter — pact
 * never touches headers, cookies, or transport. `scheme` routes
 * validation inside `authenticate`.
 */
export type PactCredential =
  | { readonly scheme: 'BEARER'; readonly token: string }
  | {
    readonly scheme: 'BASIC';
    readonly identifier: string;
    readonly password: string;
  }
  | {
    readonly scheme: 'APIKEY';
    readonly keyId: string;
    readonly secret: string;
  }
  | {
    readonly scheme: 'HMAC';
    readonly keyId: string;
    /** Hex signature over `payload`, as produced by crypt's signHMAC. */
    readonly signature: string;
    /**
     * The canonicalized content the signature covers. Canonicalization
     * (which bytes of the request are signed, replay windows) is the
     * framework/application contract — pact never guesses transport
     * bytes.
     */
    readonly payload: string;
  };
