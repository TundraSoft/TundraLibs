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

/**
 * Build a KV binding that talks to Cloudflare's REST API.
 *
 * @param options - Account, namespace, API token and optional base URL.
 * @param fetcher - The fetch to use (tests inject one).
 * @returns A binding with KV's `get` / `put` / `delete` contract: `get`
 *   resolves `null` for a missing key; any other non-2xx response rejects
 *   with Cloudflare's error messages.
 */
export function kvHttpBinding(
  options: WorkersKVHttpOptions,
  fetcher: typeof globalThis.fetch = compatFetch,
): WorkersKVNamespace {
  const base = `${(options.baseURL ?? CLOUDFLARE_API).replace(/\/+$/, '')}` +
    `/accounts/${encodeURIComponent(options.accountId)}` +
    `/storage/kv/namespaces/${encodeURIComponent(options.namespaceId)}/values/`;
  const call = (
    method: string,
    key: string,
    init: { query?: string; body?: string } = {},
  ) =>
    fetcher(`${base}${encodeURIComponent(key)}${init.query ?? ''}`, {
      method,
      headers: {
        authorization: `Bearer ${options.apiToken}`,
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
  };
}
