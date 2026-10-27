/**
 * Per-call options for `fetch()`.
 */
export type ImapFetchOptions = {
  /** Overrides `ImapClientOptions.maxSize` for this call. */
  maxSize?: number;
};
