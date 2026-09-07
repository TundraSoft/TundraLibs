/**
 * The transport-neutral view of one incoming request. Each framework
 * adapter builds it from its own request object; a custom adapter needs
 * `method`, `path`, and `header` — the rest feed the HMAC template
 * (`${@query}`, `${@authority}`, `${@scheme}`) and the body-bound
 * features (`${content-digest}`, payload decryption), and read as empty
 * when absent.
 */
export type PactMiddlewareRequest = {
  /** HTTP method; the template renders it uppercase. */
  readonly method: string;
  /** Request path without the query string (`/users/42`). */
  readonly path: string;
  /** Raw query string with its leading `?`, or `''`/absent when none. */
  readonly query?: string;
  /** `host[:port]` as requested (RFC 9421 `@authority`). */
  readonly authority?: string;
  /** `http` or `https` (RFC 9421 `@scheme`). */
  readonly scheme?: string;
  /**
   * Case-insensitive single-header lookup; null when absent. A repeated
   * header is comma-joined (RFC 9110 §5.3).
   */
  readonly header: (name: string) => string | null;
  /**
   * The raw request body, byte-exact as received; null when there is
   * none. Called at most once, and only when a body-bound feature is on.
   */
  readonly body?: () => Promise<Uint8Array | string | null>;
};
