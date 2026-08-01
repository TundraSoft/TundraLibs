/**
 * @fileoverview Cross-cutting HTTP-protocol primitives — method names,
 * status codes, status-text map. These are runtime-agnostic by design
 * and live in `compat` so server-side packages
 * (`@tundralibs/compat/webserver`, `@tundralibs/radrouter`,
 * `@tundralibs/rpc`) and client-side ones (a future `http-client`,
 * fetch wrappers, etc.) share one definition.
 *
 * Kept separate from `compat/webserver` so consumers can pull just the
 * protocol-level types without dragging in the `WebServer` class
 * surface.
 *
 * @module
 */

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
