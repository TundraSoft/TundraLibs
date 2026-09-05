/**
 * WebAuthn `PublicKeyCredentialRequestOptions` in its JSON form — what
 * `beginPasskeyLogin` returns for the browser to feed to
 * `PublicKeyCredential.parseRequestOptionsFromJSON` and
 * `navigator.credentials.get`. An empty `allowCredentials` list invites
 * a discoverable-credential (usernameless) sign-in.
 */
export type PactPasskeyRequestOptions = {
  /** base64url challenge — also returned alongside for the app to stash. */
  readonly challenge: string;
  readonly rpId: string;
  readonly timeout: number;
  readonly userVerification: 'required' | 'preferred' | 'discouraged';
  readonly allowCredentials: readonly {
    readonly type: 'public-key';
    readonly id: string;
    readonly transports?: readonly string[];
  }[];
};
