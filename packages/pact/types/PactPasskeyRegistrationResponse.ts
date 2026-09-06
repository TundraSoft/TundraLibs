/**
 * The browser's registration result as `PublicKeyCredential.toJSON()`
 * emits it — pass it to `finishPasskeyRegistration` verbatim. Only the
 * fields pact verifies are typed; extra fields are ignored.
 */
export type PactPasskeyRegistrationResponse = {
  /** The new credential id (base64url). */
  readonly id: string;
  readonly response: {
    /** base64url `clientDataJSON`. */
    readonly clientDataJSON: string;
    /** base64url CBOR attestation object (fmt, attStmt, authData). */
    readonly attestationObject: string;
    /** Authenticator transports, when the browser reports them. */
    readonly transports?: readonly string[];
  };
};
