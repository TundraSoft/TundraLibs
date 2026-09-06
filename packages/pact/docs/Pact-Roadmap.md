# Roadmap

Known limitations and planned work, in rough priority order. None of these
block production use; each has a documented workaround today.

| Item                                         | Today                                                                                          | Planned                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Passkey Ed25519 credentials                  | ES256 and RS256 ship; `-8` needs OKP support in crypt first                                    | COSE OKP in `coseToJwk`, then an `ED25519` algorithm option                                                                  |
| Passkey full attestation                     | Policy `none`: attStmt parsed, chains not verified                                             | packed/TPM chain verification, on device-allowlist demand                                                                    |
| Stateless validation mode                    | JWT validation reads the family record, so revocation already works; validators need the store | Asymmetric signing + published JWKS so validators hold no secret, plus an optional `isRevoked` denylist hook — demand-driven |
| HMAC replay protection                       | App includes a timestamp/nonce in its canonical payload                                        | Native timestamp + nonce window in the HMAC scheme                                                                           |
| `TOKEN` scheme (static webhook-style tokens) | Model as API keys                                                                              | First-class hashed static tokens                                                                                             |
| OAuth provider-token access                  | Provider tokens serve the login exchange and are discarded                                     | Surfacing (and refreshing) provider tokens for API calls on the user's behalf                                                |
| Claims/attribute rules                       | Bitmask modules only; attribute logic stays in app code                                        | A small claims DSL over the bitmask kernel                                                                                   |
| Encrypted cache entries                      | API-key cache trusts the engine ([Caching](Pact-Caching.md))                                   | Optional pact-side encryption of its own cache payloads                                                                      |

---

[← Back to Pact](../README.md)
