/**
 * @module
 *
 * A {@link WorkersKVNamespace} over Cloudflare's KV REST API, so the
 * Workers KV engine runs outside a Worker. Values are read and written
 * raw at `.../storage/kv/namespaces/{namespace}/values/{key}`.
 */

import { fetch as compatFetch } from '@tundralibs/compat/fetch';
import type { WorkersKVHttpOptions, WorkersKVNamespace } from './types/mod.ts';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
/** Most keys one bulk read takes. */
const BULK_GET_MAX = 100;
/** Most items one bulk write or delete takes. */
const BULK_WRITE_MAX = 10_000;

/** The REST binding's bulk calls — one request per chunk, so each counts
 * once against the API rate limit. */
export type WorkersKVBulk = {
  /** Values by key; a missing key maps to `null`. */
  getMany(keys: string[]): Promise<Map<string, string | null>>;
  putMany(
    items: { key: string; value: string; expirationTtl?: number }[],
  ): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
};

/** `items` in slices of at most `size`. */
const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from(
    { length: Math.ceil(items.length / size) },
    (_, i) => items.slice(i * size, (i + 1) * size),
  );

/**
 * Build a KV binding that talks to Cloudflare's REST API.
 *
 * @param options - Account, namespace, API token and optional base URL.
 * @param fetcher - The fetch to use (tests inject one).
 * @returns A binding with KV's `get` / `put` / `delete` contract, plus the
 *   {@link WorkersKVBulk} calls: `get` resolves `null` for a missing key;
 *   any other non-2xx response (or a key a bulk write reports as
 *   unsuccessful) rejects with Cloudflare's error messages.
 */
export function kvHttpBinding(
  options: WorkersKVHttpOptions,
  fetcher: typeof globalThis.fetch = compatFetch,
): WorkersKVNamespace & WorkersKVBulk {
  const namespace =
    `${(options.baseURL ?? CLOUDFLARE_API).replace(/\/+$/, '')}/accounts/${
      encodeURIComponent(options.accountId)
    }` +
    `/storage/kv/namespaces/${encodeURIComponent(options.namespaceId)}`;
  const base = `${namespace}/values/`;
  const auth = { authorization: `Bearer ${options.apiToken}` };
  /** A bulk call: JSON in, Cloudflare's envelope out. */
  const bulk = async (
    method: string,
    path: string,
    body: unknown,
  ): Promise<Record<string, unknown>> => {
    const res = await fetcher(`${namespace}${path}`, {
      method,
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await failure(`${method} ${path}`, res);
    const json = await res.json() as { result?: Record<string, unknown> };
    const failed = json.result?.unsuccessful_keys as string[] | undefined;
    if (failed !== undefined && failed.length > 0) {
      throw new Error(
        `Workers KV ${method} ${path} failed for ${failed.length} key(s): ` +
          failed.slice(0, 5).join(', '),
      );
    }
    return json.result ?? {};
  };
  const call = (
    method: string,
    key: string,
    init: { query?: string; body?: string } = {},
  ) =>
    fetcher(`${base}${encodeURIComponent(key)}${init.query ?? ''}`, {
      method,
      headers: {
        ...auth,
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'text/plain;charset=UTF-8' }),
      },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
  const failure = async (method: string, res: Response): Promise<Error> => {
    let detail = '';
    try {
      const json = await res.json() as { errors?: { message?: string }[] };
      detail = (json.errors ?? []).map((e) => e.message).filter(Boolean)
        .join('; ');
    } catch {
      // Not Cloudflare's JSON envelope.
    }
    return new Error(
      `Workers KV ${method} failed: HTTP ${res.status}${
        detail ? ` — ${detail}` : ''
      }`,
    );
  };
  return {
    async get(key) {
      const res = await call('GET', key);
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) throw await failure('GET', res);
      return await res.text();
    },
    async put(key, value, putOptions) {
      const ttl = putOptions?.expirationTtl;
      const res = await call('PUT', key, {
        body: value,
        ...(ttl ? { query: `?expiration_ttl=${ttl}` } : {}),
      });
      if (!res.ok) throw await failure('PUT', res);
      await res.body?.cancel();
    },
    async delete(key) {
      const res = await call('DELETE', key);
      if (!res.ok && res.status !== 404) throw await failure('DELETE', res);
      await res.body?.cancel();
    },
    async getMany(keys) {
      const out = new Map<string, string | null>();
      for (const slice of chunks(keys, BULK_GET_MAX)) {
        const result = await bulk('POST', '/bulk/get', {
          keys: slice,
          type: 'text',
        });
        const values = (result.values ?? {}) as Record<string, unknown>;
        for (const key of slice) {
          const v = values[key];
          out.set(key, typeof v === 'string' ? v : null);
        }
      }
      return out;
    },
    async putMany(items) {
      for (const slice of chunks(items, BULK_WRITE_MAX)) {
        await bulk(
          'PUT',
          '/bulk',
          slice.map(({ key, value, expirationTtl }) => ({
            key,
            value,
            ...(expirationTtl ? { expiration_ttl: expirationTtl } : {}),
          })),
        );
      }
    },
    async deleteMany(keys) {
      for (const slice of chunks(keys, BULK_WRITE_MAX)) {
        await bulk('POST', '/bulk/delete', slice);
      }
    },
  };
}
