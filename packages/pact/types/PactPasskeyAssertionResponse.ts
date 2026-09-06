/**
 * The browser's authentication result as `PublicKeyCredential.toJSON()`
 * emits it — pass it to `finishPasskeyLogin` verbatim. Only the fields
 * pact verifies are typed; extra fields are ignored.
 */
export type PactPasskeyAssertionResponse = {
  /** The asserted credential id (base64url). */
  readonly id: string;
  readonly response: {
    /** base64url `clientDataJSON`. */
    readonly clientDataJSON: string;
    /** base64url authenticator data. */
    readonly authenticatorData: string;
    /** base64url signature over authenticatorData ‖ SHA-256(clientDataJSON). */
    readonly signature: string;
    /** base64url user handle for discoverable credentials; null/absent
     * otherwise. */
    readonly userHandle?: string | null;
  };
};
