/**
 * Reach a Workers KV namespace over Cloudflare's REST API, for code that
 * runs outside a Worker (a server, a CLI, a cron job). Every call counts
 * against the account's Cloudflare API rate limit and pays a round trip
 * to the API, so it suits low-volume and administrative access — not a
 * hot-path cache. Consistency and expiry rules are KV's, as with a binding.
 */
export type WorkersKVHttpOptions = {
  /** Cloudflare account id. */
  accountId: string;
  /** KV namespace id (not its title). */
  namespaceId: string;
  /** API token with Workers KV Storage edit permission — a secret. */
  apiToken: string;
  /**
   * API base URL.
   * @default 'https://api.cloudflare.com/client/v4'
   */
  baseURL?: string;
};
