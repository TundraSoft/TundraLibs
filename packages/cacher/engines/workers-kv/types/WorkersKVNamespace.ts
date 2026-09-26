/**
 * The subset of a Cloudflare Workers KV namespace binding that
 * {@link WorkersKVCacher} calls.
 *
 * Declared structurally so cacher needs no dependency on
 * `@cloudflare/workers-types`: the `KVNamespace` a Worker receives on `env`
 * satisfies it, and so does Miniflare's namespace or a test double.
 *
 * @example
 * ```ts
 * const store = new Map<string, string>();
 * const fake: WorkersKVNamespace = {
 *   get: (key) => Promise.resolve(store.get(key) ?? null),
 *   put: (key, value) => Promise.resolve(void store.set(key, value)),
 *   delete: (key) => Promise.resolve(void store.delete(key)),
 * };
 * ```
 */
export type WorkersKVNamespace = {
  /** Read a value as text; `null` when the key is absent or expired. */
  get(key: string): Promise<string | null>;
  /** Write a value. `expirationTtl` is in seconds and must be at least 60. */
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  /** Remove a key. Resolves whether or not the key existed. */
  delete(key: string): Promise<void>;
};
