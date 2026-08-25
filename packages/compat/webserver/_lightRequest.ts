/**
 * @fileoverview `LightRequest` — a lightweight, `Request`-shaped object for the
 * Node inbound path. Node's `http` gives `IncomingMessage`, not a Fetch
 * `Request`, so `WebServer` must synthesize one per request — and undici's
 * `Request` constructor is ~1.8µs (the bulk of the Node translation tax; see
 * `bench/OPTIMIZATION-NOTES.md`). Most handlers only read `method` / `url` /
 * `headers` / `body`, so this defers the real construction: the common four are
 * cheap own state, and a real `Request` is materialized ONCE, lazily, only when
 * a heavy member (`text`/`json`/`arrayBuffer`/`blob`/`bytes`/`formData`/`clone`
 * or a rarely-read Fetch field) is actually touched.
 *
 * Fidelity is preserved: the prototype is chained to `Request.prototype`, so
 * `instanceof Request` still holds, and the full standard `Request` surface is
 * present (cheap where it can be, delegated to the materialized instance
 * otherwise). The one edge is `bodyUsed`: it reflects the materialized real
 * `Request`, so it flips `true` only once a body-read method runs — reading the
 * raw `body` stream directly does not update it. Consuming the body once through
 * a single path (the Fetch contract already) keeps this invisible. Node-only —
 * Deno/Bun hand their runtime's native `Request` straight through and never
 * reach this.
 *
 * @module
 */

/** The materialized real `Request`, built on first heavy access. */
const REAL = Symbol('rapid.compat.lightRequest.real');

/**
 * A `Request`-shaped view over Node's `IncomingMessage` parts. Reads of
 * `method`/`url`/`headers`/`body` never build a real `Request`; anything else
 * (a body read, `clone`, `signal`, …) does, once, and is cached.
 */
class LightRequest {
  private readonly __method: string;
  private readonly __url: string;
  private readonly __headerPairs: ReadonlyArray<[string, string]>;
  private readonly __body: ReadableStream<Uint8Array> | null;
  private __headers: Headers | undefined;
  private [REAL]: Request | undefined;

  constructor(
    method: string,
    rawUrl: string,
    headerPairs: ReadonlyArray<[string, string]>,
    body: ReadableStream<Uint8Array> | null,
  ) {
    this.__method = method;
    // Parse + normalize the URL EAGERLY: this is the one thing that must fail
    // AT CONSTRUCTION — a malformed Host makes `new URL` throw, which the Node
    // handler's try/catch turns into a 400 before dispatch (as the eager
    // `new Request` used to). It also gives `.url` undici-identical normalized
    // form. The ~1.8µs undici `Request` constructor is still skipped.
    this.__url = new URL(rawUrl).href;
    this.__headerPairs = headerPairs;
    this.__body = body;
  }

  /** The materialized real `Request`, built once. Heavy members delegate here. */
  private get __real(): Request {
    return this[REAL] ??= new Request(this.url, {
      method: this.__method,
      headers: this.headers,
      body: this.__body,
      // @ts-expect-error - duplex is required for a streaming request body
      duplex: 'half',
    });
  }

  // ── cheap own members (the common path — no real Request) ──────────────
  get method(): string {
    return this.__method;
  }

  /** Normalized absolute URL, exactly as `Request` would expose it. */
  get url(): string {
    return this.__url;
  }

  /** A real `Headers`, built once from the inbound pairs (accumulates duplicates). */
  get headers(): Headers {
    return this.__headers ??= new Headers(
      this.__headerPairs as [string, string][],
    );
  }

  get body(): ReadableStream<Uint8Array> | null {
    return this.__body;
  }

  get bodyUsed(): boolean {
    // Reflects the materialized Request; a raw `body` stream read (no read
    // method) leaves it false. See the fileoverview caveat.
    return this[REAL]?.bodyUsed ?? false;
  }

  // ── delegated Fetch fields (rarely read; force materialization) ─────────
  get signal(): AbortSignal {
    return this.__real.signal;
  }
  get cache(): RequestCache {
    return this.__real.cache;
  }
  get credentials(): RequestCredentials {
    return this.__real.credentials;
  }
  get destination(): RequestDestination {
    return this.__real.destination;
  }
  get integrity(): string {
    return this.__real.integrity;
  }
  get keepalive(): boolean {
    return this.__real.keepalive;
  }
  get mode(): RequestMode {
    return this.__real.mode;
  }
  get redirect(): RequestRedirect {
    return this.__real.redirect;
  }
  get referrer(): string {
    return this.__real.referrer;
  }
  get referrerPolicy(): ReferrerPolicy {
    return this.__real.referrerPolicy;
  }

  // ── delegated body readers (materialize once; share the one body stream) ─
  text(): Promise<string> {
    return this.__real.text();
  }
  json(): Promise<unknown> {
    return this.__real.json();
  }
  arrayBuffer(): Promise<ArrayBuffer> {
    return this.__real.arrayBuffer();
  }
  blob(): Promise<Blob> {
    return this.__real.blob();
  }
  bytes(): Promise<Uint8Array> {
    return (this.__real as Request & { bytes(): Promise<Uint8Array> }).bytes();
  }
  formData(): Promise<FormData> {
    return this.__real.formData();
  }
  clone(): Request {
    return this.__real.clone();
  }
}

// `instanceof Request` must still hold for any consumer that checks it. The
// cheap getters + delegating members above SHADOW Request.prototype's, so a
// call never reaches undici's internal-slot methods on a non-real instance.
Object.setPrototypeOf(LightRequest.prototype, Request.prototype);

/**
 * Build a {@link LightRequest} for the Node inbound path. Returns it typed as
 * `Request` (it is one, structurally and by `instanceof`).
 *
 * @param method - The request method.
 * @param rawUrl - The absolute request URL (origin-form already concatenated).
 * @param headerPairs - Inbound header name/value pairs (duplicates accumulate).
 * @param body - The request body stream, or `null` for GET/HEAD.
 */
export function nodeLightRequest(
  method: string,
  rawUrl: string,
  headerPairs: ReadonlyArray<[string, string]>,
  body: ReadableStream<Uint8Array> | null,
): Request {
  return new LightRequest(
    method,
    rawUrl,
    headerPairs,
    body,
  ) as unknown as Request;
}
