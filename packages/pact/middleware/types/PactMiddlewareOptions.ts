import type { PactCredential } from '../../types/mod.ts';
import type { PactMiddlewareRequest } from './PactMiddlewareRequest.ts';

/**
 * Behavior switches shared by every framework adapter.
 */
export type PactMiddlewareOptions = {
  /**
   * Credential schemes the middleware accepts. A presented credential
   * of a scheme not listed here is treated as absent.
   *
   * @default ['BEARER', 'BASIC', 'APIKEY'] (plus 'HMAC' when `hmac` is configured)
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
   * Enables the HMAC scheme (`x-key-id` + `x-signature` headers).
   * `canonical` returns the exact string the client signed — this is
   * the contract between your clients and your server, so there is no
   * default. A common choice: `(req) => `${req.method} ${req.path}``.
   */
  readonly hmac?: {
    readonly canonical: (req: PactMiddlewareRequest) => string;
  };
};
