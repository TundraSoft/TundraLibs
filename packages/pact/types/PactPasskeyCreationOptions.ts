/**
 * WebAuthn `PublicKeyCredentialCreationOptions` in its JSON form —
 * what `beginPasskeyRegistration` returns for the browser to feed to
 * `PublicKeyCredential.parseCreationOptionsFromJSON` and
 * `navigator.credentials.create`. Field values here are wire values
 * (lowercase, base64url) as the spec defines them.
 */
export type PactPasskeyCreationOptions = {
  readonly rp: { readonly id: string; readonly name: string };
  readonly user: {
    /** base64url of the user id — echoed back as `userHandle`. Capped
     * at 64 bytes by WebAuthn (enforced at `beginPasskeyRegistration`);
     * per the spec's privacy rules it should be an opaque id, not an
     * email. */
    readonly id: string;
    readonly name: string;
    readonly displayName: string;
  };
  /** base64url challenge — also returned alongside for the app to stash. */
  readonly challenge: string;
  readonly pubKeyCredParams: readonly {
    readonly type: 'public-key';
    /** COSE algorithm identifier (-7 ES256, -257 RS256). */
    readonly alg: number;
  }[];
  readonly timeout: number;
  /** The user's existing passkeys, so an authenticator refuses to
   * re-register itself. */
  readonly excludeCredentials: readonly {
    readonly type: 'public-key';
    readonly id: string;
    readonly transports?: readonly string[];
  }[];
  readonly authenticatorSelection: {
    readonly residentKey: 'preferred';
    readonly userVerification: 'required' | 'preferred' | 'discouraged';
  };
  readonly attestation: 'none';
};
