/**
 * @fileoverview {@link PactMiddlewareOptions} — the one options bag every
 * framework adapter and the neutral core share: which schemes, how each
 * is carried, the HMAC signing contract, and optional payload encryption.
 *
 * @module
 */
import type {
  PactCredential,
  PactHmacAlgorithm,
  PactJweEncryption,
} from '../../types/mod.ts';

/**
 * Behavior switches shared by every framework adapter. Every carrier
 * (header name, scheme prefix) defaults to the standard; set one only to
 * match clients you do not control.
 */
export type PactMiddlewareOptions = {
  /**
   * Credential schemes the middleware accepts. A presented credential
   * of a scheme not listed here is treated as absent. Scheme names refer
   * to the CARRIER: `'BASIC'` with `basic.credential: 'apiKey'` still
   * authenticates as an API key.
   *
   * @default ['BEARER', 'BASIC', 'APIKEY'] (plus 'HMAC' when `hmac` is set)
   */
  readonly schemes?: readonly PactCredential['scheme'][];
  /**
   * When true, a request without a credential continues unauthenticated
   * (nothing is attached) instead of being rejected with 401. A request
   * that presents a credential is still verified and still fails with
   * 401 when it is invalid.
   *
   * @default false
   */
  readonly optional?: boolean;
  /**
   * Send a `WWW-Authenticate` header (one challenge per accepted scheme)
   * with every 401 the two handlers raise.
   *
   * @default true
   */
  readonly challenge?: boolean;
  /** The `realm` parameter of those challenges. Omitted when unset. */
  readonly realm?: string;
  /** Bearer carrier (RFC 6750): `<header>: <prefix> <token>`. */
  readonly bearer?: {
    /** @default 'authorization' */
    readonly header?: string;
    /** Case-insensitive; `''` reads the whole header as the token. @default 'Bearer' */
    readonly prefix?: string;
  };
  /** Basic carrier (RFC 7617): `<header>: <prefix> base64(id:secret)`. */
  readonly basic?: {
    /** @default 'authorization' */
    readonly header?: string;
    /** @default 'Basic' */
    readonly prefix?: string;
    /**
     * What the pair is: a user's identifier + password, or an API key's
     * id + secret (authenticates as the key — `via: 'APIKEY'`).
     *
     * @default 'user'
     */
    readonly credential?: 'user' | 'apiKey';
  };
  /**
   * API-key carrier: one header holding `<prefix> <keyId>:<secret>`
   * (default `Authorization: ApiKey k:s`), or two headers holding the
   * halves.
   */
  readonly apiKey?:
    | {
      /** @default 'authorization' */
      readonly header?: string;
      /** @default 'ApiKey' */
      readonly prefix?: string;
    }
    | {
      readonly keyHeader: string;
      readonly secretHeader: string;
    };
  /**
   * Enables the HMAC scheme: the key id, a signature over the rendered
   * request `template`, and a freshness timestamp travel in headers; the
   * secret never does. After the handler, the response is signed over
   * the rendered `response` template with the same key.
   *
   * Templates use frozen RFC 9421 component names inside `${…}` — see
   * `Pact-Middleware.md`. The HEADER NAMES below are what the wire
   * carries; the template keys never change.
   */
  readonly hmac?: {
    /** @default 'x-key-id' */
    readonly keyHeader?: string;
    /** Hex signature, request and response. @default 'x-signature' */
    readonly signatureHeader?: string;
    /** Integer Unix seconds, request and response. @default 'x-timestamp' */
    readonly timestampHeader?: string;
    /** Client nonce, echoed on the response. @default 'x-nonce' */
    readonly nonceHeader?: string;
    /**
     * What the client signs. Mandatory keys: `${@method}`, `${@path}`,
     * `${x-timestamp}`, `${content-digest}`.
     *
     * @default '${@method}\n${@path}${@query}\n${x-timestamp}\n${content-digest}'
     */
    readonly template?: string;
    /**
     * What the server signs back; `false` turns response signing off.
     * Mandatory keys: `${@status}`, `${x-timestamp}`, `${content-digest}`.
     *
     * @default '${@status}\n${x-timestamp}\n${content-digest}'
     */
    readonly response?: string | false;
    /** @default 'SHA-256' */
    readonly algorithm?: PactHmacAlgorithm;
    /**
     * Largest accepted |server time − `${x-timestamp}`| in seconds; a
     * request outside it is a 401 `STALE_TIMESTAMP`.
     *
     * @default 300
     */
    readonly maxSkew?: number;
  };
  /**
   * Payload encryption for key-authenticated requests (API key, HMAC):
   * a request body sent as `application/jose` is a compact JWE for the
   * key, opened with its secret and handed to the handler decrypted; the
   * response body is encrypted back the same way. Session (Bearer)
   * requests are untouched — they hold no shared secret.
   */
  readonly encryption?: {
    /** The one content encryption accepted and produced. @default 'A256GCM' */
    readonly enc?: PactJweEncryption;
    /**
     * Reject (400 `ENCRYPTION_INVALID`) a key-authenticated request that
     * carries a plaintext body.
     *
     * @default false
     */
    readonly required?: boolean;
  };
};
