/**
 * @fileoverview Cross-runtime `fetch` with optional TLS client auth
 * and UNIX-socket transport. Adds path-traversal and PEM validation
 * before handing values to the runtime's native HTTP client.
 *
 * Plain HTTP works everywhere; TLS / UNIX features require Deno or
 * Bun. Node would need `undici`, which we don't pull in.
 *
 * @module
 */

import { RUNTIME } from './runtime.ts';
import { UnsupportedRuntimeError } from './Error.ts';
import {
  type TLSOptions,
  type ValidatedTLS,
  validateTLS,
  validateUnixSocket,
} from './common.ts';
const _fetch = globalThis.fetch;

// Local aliases for Deno-only types — see _runtime-globals.ts header.
// At runtime these are populated by `Deno.createHttpClient(...)`; the
// `any` typing keeps us decoupled from Deno's lib type definitions.
// deno-lint-ignore no-explicit-any
type DenoHttpClient = any;
// deno-lint-ignore no-explicit-any
type DenoCreateHttpClientOptions = any;
// deno-lint-ignore no-explicit-any
type DenoTlsCertifiedKeyPem = any;

/** @internal */
type DenoFetchInit = RequestInit & {
  client?: DenoHttpClient;
};

/**
 * `fetch` plus optional `tls` (client-cert auth) and `unix` (UNIX
 * socket transport). Without those keys it's a transparent passthrough
 * to the runtime's native `fetch`.
 *
 * @throws {@link FetchPathTraversalError} | {@link FetchFileNotFoundError}
 *   | {@link FetchInvalidPEMError} On bad TLS / socket inputs.
 * @throws {@link UnsupportedRuntimeError} If `tls` or `unix` is used
 *   outside Deno / Bun.
 * @throws {Error} On Deno, when `tls.rejectUnauthorized` is `false` —
 *   Deno has no in-process way to disable certificate verification, so
 *   (like `net.connect`) this fails loudly rather than silently keeping
 *   verification on. Bun threads the flag through natively.
 *
 * @example
 * ```typescript
 * await fetch('https://secure.api/data', {
 *   tls: { certFile: 'client.crt', keyFile: 'client.key' },
 * });
 * ```
 */
export const fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit & {
    /** Path to Unix domain socket for local connections */
    unix?: string;
    /** TLS client authentication configuration */
    tls?: TLSOptions;
  },
): Promise<Response> => { // NOSONAR complexity allowed for compatibility wrapper
  const { unix, tls } = init ?? {};
  // Early exit
  if (!unix && !tls) {
    return _fetch(input, init);
  }

  // `fetchInit` carries the Bun-specific `tls` / `unix` extensions when
  // running on Bun, and Deno's `client` field when running on Deno. None
  // of these are in the standard `RequestInit` so we widen the local
  // type — the runtime's own `fetch` accepts the extensions it cares
  // about; the others are silently ignored.
  const fetchInit:
    & RequestInit
    & { tls?: unknown; unix?: string; client?: unknown } = { ...init };
  const denoClientConfig:
    & DenoCreateHttpClientOptions
    & Partial<DenoTlsCertifiedKeyPem> = {};

  // Process TLS options
  if (tls) {
    // Check runtime support first before validating
    if (RUNTIME !== 'DENO' && RUNTIME !== 'BUN') {
      throw new UnsupportedRuntimeError('fetch with TLS');
    }

    const validatedTLS: ValidatedTLS = validateTLS(tls);

    /* c8 ignore start */
    if (RUNTIME === 'BUN') {
      fetchInit.tls = {
        cert: validatedTLS.cert,
        key: validatedTLS.key,
        ca: validatedTLS.ca,
        // Thread the documented dev-only flag through to Bun's fetch.
        // validateTLS deliberately doesn't carry it (read from opts here);
        // without this the `rejectUnauthorized: false` option was a no-op.
        rejectUnauthorized: tls.rejectUnauthorized,
      };
    } else if (RUNTIME === 'DENO') {
      /* c8 ignore stop */
      // Deno's `createHttpClient` has no in-process verification bypass —
      // `caCerts` only *adds* trust, it never disables it. Rather than
      // silently keep verification on (surprising, since Bun honours the
      // flag here), mirror `net.connect` / `net.upgradeTls` and surface the
      // CLI escape hatch so the caller isn't misled.
      if (tls.rejectUnauthorized === false) {
        throw new Error(
          `compat.fetch: \`rejectUnauthorized: false\` is not supported on Deno. ` +
            `Run Deno with \`--unsafely-ignore-certificate-errors\`, or pass ` +
            `the server's CA certificate via \`tls.ca\`/\`tls.caFile\`.`,
        );
      }
      denoClientConfig.cert = validatedTLS.cert;
      denoClientConfig.key = validatedTLS.key;
      if (validatedTLS.ca) {
        denoClientConfig.caCerts = validatedTLS.ca;
      }
      /* c8 ignore start */
    }
    /* c8 ignore stop */
  }

  // Process Unix socket option
  if (unix) {
    // Check runtime support first before validating path
    if (RUNTIME !== 'DENO' && RUNTIME !== 'BUN') {
      throw new UnsupportedRuntimeError('fetch with Unix socket');
    }

    await validateUnixSocket(unix);

    /* c8 ignore start */
    if (RUNTIME === 'DENO') {
      denoClientConfig.proxy = {
        transport: 'unix',
        path: unix,
      };
    } else if (RUNTIME === 'BUN') {
      fetchInit.unix = unix;
    }
    /* c8 ignore stop */
  }

  // Create Deno HttpClient if needed (for TLS or Unix socket)
  /* c8 ignore start */
  if (RUNTIME === 'DENO' && (unix || tls)) {
    const client = Deno.createHttpClient(denoClientConfig);
    (fetchInit as DenoFetchInit).client = client;
    try {
      return await _fetch(input, fetchInit);
    } finally {
      client.close();
    }
  }
  /* c8 ignore stop */

  return _fetch(input, fetchInit);
};
