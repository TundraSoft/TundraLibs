/**
 * @fileoverview Cross-cutting HTTP-protocol primitives — method names, status
 * codes and their text, content negotiation ({@link negotiate}), RFC 7233
 * range parsing ({@link parseRange}), RFC 6265 cookie parse/serialize
 * ({@link parseCookies} / {@link serializeCookie}), and extension →
 * `Content-Type` resolution ({@link contentTypeFor}). All are runtime-agnostic
 * and pure (only `contentTypeFor` has a dependency, `@std/media-types`), and
 * live in `compat` so server-side packages
 * (`@tundralibs/compat/webserver`, `@tundralibs/radrouter`, `@tundralibs/rpc`,
 * a framework layer) and client-side ones (fetch wrappers, a REST client)
 * share one definition instead of re-implementing them.
 *
 * Kept separate from `compat/webserver` so consumers can pull just the
 * protocol-level helpers without dragging in the `WebServer` class surface.
 *
 * @module
 */

import { contentType } from '@std/media-types';

/**
 * All HTTP request methods defined by RFC 7231 (sec. 4.3) + RFC 5789
 * (PATCH). Custom methods are out of scope — if your app needs them,
 * widen the type at the call site.
 */
export type HTTPMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE'
  | 'CONNECT';

/**
 * The HTTP status codes most application code actually emits, as a
 * literal-typed union. Anything else falls through to `number` (the
 * `& {}` is the standard idiom to keep both literal-narrowing and
 * arbitrary-number widening — IDE autocomplete shows the known codes,
 * but a custom `599` still typechecks).
 *
 * Curated from the IANA registry; omitted codes can be added on demand
 * (Phase-2 additions go here, not on the consumer side).
 */
export type StatusCode =
  // 1xx — Informational
  | 100 // Continue
  | 101 // Switching Protocols
  | 102 // Processing
  | 103 // Early Hints
  // 2xx — Success
  | 200 // OK
  | 201 // Created
  | 202 // Accepted
  | 203 // Non-Authoritative Information
  | 204 // No Content
  | 205 // Reset Content
  | 206 // Partial Content
  | 207 // Multi-Status
  | 208 // Already Reported
  | 226 // IM Used
  // 3xx — Redirection
  | 300 // Multiple Choices
  | 301 // Moved Permanently
  | 302 // Found
  | 303 // See Other
  | 304 // Not Modified
  | 307 // Temporary Redirect
  | 308 // Permanent Redirect
  // 4xx — Client Error
  | 400 // Bad Request
  | 401 // Unauthorized
  | 402 // Payment Required
  | 403 // Forbidden
  | 404 // Not Found
  | 405 // Method Not Allowed
  | 406 // Not Acceptable
  | 407 // Proxy Authentication Required
  | 408 // Request Timeout
  | 409 // Conflict
  | 410 // Gone
  | 411 // Length Required
  | 412 // Precondition Failed
  | 413 // Payload Too Large
  | 414 // URI Too Long
  | 415 // Unsupported Media Type
  | 416 // Range Not Satisfiable
  | 417 // Expectation Failed
  | 418 // I'm a teapot
  | 421 // Misdirected Request
  | 422 // Unprocessable Entity
  | 423 // Locked
  | 424 // Failed Dependency
  | 425 // Too Early
  | 426 // Upgrade Required
  | 428 // Precondition Required
  | 429 // Too Many Requests
  | 431 // Request Header Fields Too Large
  | 451 // Unavailable For Legal Reasons
  // 5xx — Server Error
  | 500 // Internal Server Error
  | 501 // Not Implemented
  | 502 // Bad Gateway
  | 503 // Service Unavailable
  | 504 // Gateway Timeout
  | 505 // HTTP Version Not Supported
  | 506 // Variant Also Negotiates
  | 507 // Insufficient Storage
  | 508 // Loop Detected
  | 510 // Not Extended
  | 511 // Network Authentication Required
  // Escape hatch for custom / non-standard codes — keeps the union
  // narrowable to known literals in IDE while still accepting `number`.
  // deno-lint-ignore ban-types
  | (number & {});

/**
 * Default reason-phrase text for each {@link StatusCode}. The values
 * come from the IANA HTTP Status Code Registry; consumers can override
 * by writing their own phrase at the response layer.
 *
 * Use as `STATUS_TEXT[404] // 'Not Found'`. Unknown codes return
 * `undefined`.
 */
export const STATUS_TEXT: Readonly<Record<number, string>> = Object.freeze({
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required',
});

// =============================================================================
// Content negotiation — `Accept` header, q-value + specificity
// =============================================================================

type AcceptEntry = { type: string; subtype: string; q: number };

/** Parse an `Accept` header into `{ type, subtype, q }`; unknown params ignored. */
const parseAccept = (header: string): AcceptEntry[] => {
  const entries: AcceptEntry[] = [];
  for (const part of header.split(',')) {
    const [media, ...params] = part.trim().split(';');
    const slash = media.indexOf('/');
    if (slash === -1) continue;
    const type = media.slice(0, slash).trim().toLowerCase();
    const subtype = media.slice(slash + 1).trim().toLowerCase();
    if (type === '' || subtype === '') continue;
    let q = 1;
    for (const p of params) {
      const eq = p.indexOf('=');
      if (eq !== -1 && p.slice(0, eq).trim().toLowerCase() === 'q') {
        const v = Number.parseFloat(p.slice(eq + 1).trim());
        if (!Number.isNaN(v)) q = Math.max(0, Math.min(1, v));
      }
    }
    entries.push({ type, subtype, q });
  }
  return entries;
};

/** The q an offered type earns from `entries` — the MOST SPECIFIC match wins. */
const qualityOf = (offered: string, entries: AcceptEntry[]): number => {
  const slash = offered.indexOf('/');
  if (slash === -1) return 0; // require a full `type/subtype`
  const oType = offered.slice(0, slash).toLowerCase();
  const oSub = offered.slice(slash + 1).toLowerCase();
  let bestSpec = -1;
  let q = 0;
  for (const e of entries) {
    let spec: number;
    if (e.type === oType && e.subtype === oSub) spec = 3; // exact
    else if (e.type === oType && e.subtype === '*') spec = 2; // type/*
    else if (e.type === '*' && e.subtype === '*') spec = 1; // */*
    else continue;
    if (spec > bestSpec) {
      bestSpec = spec;
      q = e.q;
    }
  }
  return bestSpec === -1 ? 0 : q;
};

/**
 * Choose the best `offered` media type for an `Accept` header, or `undefined`
 * when the client accepts none of them. A missing/blank/unparseable `Accept`
 * yields the FIRST offered (the server's default). Offered values must be full
 * `type/subtype` media types; the most-specific `Accept` entry decides an
 * offer's quality, and ties resolve to the earliest offered (server
 * preference). Pure and transport-agnostic.
 *
 * @param accept - The request's `Accept` header value (or `null`).
 * @param offered - The media types the server can produce, in preference order.
 * @returns The chosen media type, or `undefined` when none is acceptable.
 */
export function negotiate(
  accept: string | null,
  offered: readonly string[],
): string | undefined {
  if (offered.length === 0) return undefined;
  if (accept === null || accept.trim() === '') return offered[0];
  const entries = parseAccept(accept);
  if (entries.length === 0) return offered[0];
  let best: string | undefined;
  let bestQ = 0;
  for (const o of offered) {
    const q = qualityOf(o, entries);
    if (q > bestQ) {
      bestQ = q;
      best = o;
    }
  }
  return bestQ > 0 ? best : undefined;
}

// =============================================================================
// Range requests — RFC 7233 `Range: bytes=…` parsing
// =============================================================================

/** A resolved, satisfiable byte range (inclusive bounds). */
export type ByteRange = { start: number; end: number };

/**
 * Parse a single-range `Range: bytes=a-b` / `bytes=a-` / `bytes=-n` header
 * against a known resource `size` (RFC 7233). Returns the resolved inclusive
 * {@link ByteRange}, `'unsatisfiable'` (the caller answers `416` with an
 * unsatisfied-range `Content-Range`), or `undefined` (no/invalid range → serve
 * the whole entity). Multi-range (`a-b,c-d`) is treated as `undefined` — the
 * caller serves the full body, which is a valid response. Pairs naturally with
 * `readFileStream(path, range)`.
 *
 * @param header - The `Range` header value (or `null`).
 * @param size - The total resource size in bytes.
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | undefined {
  if (header === null) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m === null || size === 0) return undefined;
  const [, a, b] = m;
  let start: number;
  let end: number;
  if (a === '' && b === '') return undefined;
  if (a === '') {
    // Suffix form `-n`: the last n bytes.
    const n = Number(b);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

// =============================================================================
// Cookies — RFC 6265 request parsing + `Set-Cookie` serialization
// =============================================================================

/** Attributes for an outbound cookie (`Set-Cookie`). */
export type CookieOptions = {
  /** Lifetime in SECONDS (`Max-Age`). */
  maxAge?: number;
  /** Absolute expiry (`Expires`). */
  expires?: Date;
  /** @default not set (the browser scopes to the request path). */
  path?: string;
  domain?: string;
  /** HTTPS-only. */
  secure?: boolean;
  /** Not readable from `document.cookie`. */
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

/**
 * Parse a `Cookie` request header into a name → value map (values
 * percent-decoded). A malformed pair is skipped, never thrown.
 *
 * @param header - The `Cookie` header value (or `null`).
 */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (header === null || header === '') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === '') continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value; // keep the raw value if it isn't valid encoding
    }
  }
  return out;
}

/**
 * Serialize one `Set-Cookie` header value. The value is percent-encoded, so it
 * can never inject `;`/CRLF into the header.
 *
 * @param name - The cookie name (RFC 6265 token — no separators/control chars).
 * @param value - The cookie value (percent-encoded on the way out).
 * @param options - Standard cookie attributes.
 * @throws {TypeError} When `name` contains characters illegal in a cookie name.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name)) {
    throw new TypeError(`Invalid cookie name: ${JSON.stringify(name)}`);
  }
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) {
    cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
  }
  if (options.expires !== undefined) {
    cookie += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options.domain !== undefined) cookie += `; Domain=${options.domain}`;
  if (options.path !== undefined) cookie += `; Path=${options.path}`;
  if (options.secure === true) cookie += '; Secure';
  if (options.httpOnly === true) cookie += '; HttpOnly';
  if (options.sameSite !== undefined) {
    cookie += `; SameSite=${options.sameSite}`;
  }
  return cookie;
}

// =============================================================================
// Content-Type resolution — a file path/name → its `Content-Type`
// =============================================================================

/**
 * The `Content-Type` for a file path or name, by its extension (with a charset
 * for text types, e.g. `text/html; charset=UTF-8`), via `@std/media-types` — a
 * comprehensive, maintained table, no hand-rolled map. An unknown extension, an
 * extension-less name, or a dotfile (`.env`) yields `application/octet-stream`.
 * Any file-serving webserver needs this to set a correct response type.
 *
 * @param pathOrName - A file path or bare name (`/a/b/page.html`, `data.json`).
 * @returns The resolved content-type, or `application/octet-stream`.
 */
export function contentTypeFor(pathOrName: string): string {
  const slash = Math.max(
    pathOrName.lastIndexOf('/'),
    pathOrName.lastIndexOf('\\'),
  );
  const name = slash < 0 ? pathOrName : pathOrName.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  // A leading-dot name (`.env`) is a dotfile, not an extension.
  const ext = dot <= 0 ? '' : name.slice(dot).toLowerCase();
  return (ext ? contentType(ext) : undefined) ?? 'application/octet-stream';
}
