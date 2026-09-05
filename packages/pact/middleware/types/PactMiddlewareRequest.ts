/**
 * The transport-neutral view of one incoming request that credential
 * extraction reads. Each framework adapter builds it from its own
 * request object; a custom adapter for any other stack only has to
 * provide these three members.
 */
export type PactMiddlewareRequest = {
  /** Uppercase HTTP method (`GET`, `POST`, ...). */
  readonly method: string;
  /** Request path without the query string (`/users/42`). */
  readonly path: string;
  /** Case-insensitive single-header lookup; null when absent. */
  readonly header: (name: string) => string | null;
};
