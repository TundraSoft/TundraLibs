/**
 * @fileoverview Attribute names from the OpenTelemetry semantic conventions.
 *
 * Backends key their UI off these exact strings — a span with `http.method`
 * renders as an HTTP request, one with `httpMethod` renders as an unlabelled
 * blob. These constants exist so that stays a compile-time concern rather than
 * a typo waiting to happen.
 *
 * Only the groups a service actually reaches for are here. Shipping the whole
 * specification is deliberately **not** planned: it is large, it churns, and
 * almost all of it is irrelevant to any one service. Attributes are plain
 * strings, so anything missing can always be passed inline.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { SemConv, Tracer } from '@tundralibs/tracer';
 *
 * const tracer = new Tracer({ serviceName: 'orders' });
 * const span = tracer.startSpan('GET /orders/42');
 *
 * span.setAttributes({
 *   [SemConv.HTTP_REQUEST_METHOD]: 'GET',
 *   [SemConv.HTTP_RESPONSE_STATUS_CODE]: 200,
 *   [SemConv.URL_PATH]: '/orders/42',
 * });
 * ```
 */

/**
 * Well-known attribute keys, grouped by concern. Names follow the current
 * (stable) OpenTelemetry conventions — note HTTP moved from `http.method` to
 * `http.request.method` and from `http.status_code` to
 * `http.response.status_code`; both current forms are used here.
 */
export const SemConv = {
  // --- service / resource -------------------------------------------------
  /** Logical name of the service. Set for you from `TracerOptions.serviceName`. */
  SERVICE_NAME: 'service.name',
  /** Version of the service. */
  SERVICE_VERSION: 'service.version',
  /** Deployment environment, e.g. `production`. */
  DEPLOYMENT_ENVIRONMENT: 'deployment.environment',

  // --- http ---------------------------------------------------------------
  /** HTTP method, e.g. `GET`. */
  HTTP_REQUEST_METHOD: 'http.request.method',
  /** HTTP response status code, e.g. `200`. */
  HTTP_RESPONSE_STATUS_CODE: 'http.response.status_code',
  /** Matched route template, e.g. `/orders/:id` — NOT the resolved path. */
  HTTP_ROUTE: 'http.route',
  /** Full request URL. */
  URL_FULL: 'url.full',
  /** Request path component. */
  URL_PATH: 'url.path',
  /** Request query component, without the leading `?`. */
  URL_QUERY: 'url.query',
  /** Scheme, e.g. `https`. */
  URL_SCHEME: 'url.scheme',
  /** Client-reported user agent. */
  USER_AGENT_ORIGINAL: 'user_agent.original',
  /** Host the request was sent to. */
  SERVER_ADDRESS: 'server.address',
  /** Port the request was sent to. */
  SERVER_PORT: 'server.port',

  // --- database -----------------------------------------------------------
  /** Database engine, e.g. `postgresql`, `mariadb`, `mongodb`, `redis`. */
  DB_SYSTEM: 'db.system',
  /** Logical database / namespace being addressed. */
  DB_NAMESPACE: 'db.namespace',
  /** The statement executed. ⚠️ May contain user data — sanitise before setting. */
  DB_QUERY_TEXT: 'db.query.text',
  /** Operation name, e.g. `SELECT`, `findOne`. */
  DB_OPERATION_NAME: 'db.operation.name',
  /** Table / collection targeted. */
  DB_COLLECTION_NAME: 'db.collection.name',

  // --- rpc / messaging ----------------------------------------------------
  /** RPC system in use. */
  RPC_SYSTEM: 'rpc.system',
  /** Service being called. */
  RPC_SERVICE: 'rpc.service',
  /** Method being called. */
  RPC_METHOD: 'rpc.method',
  /** Messaging system, e.g. `redis`, `sqs`. */
  MESSAGING_SYSTEM: 'messaging.system',
  /** Queue / topic name. */
  MESSAGING_DESTINATION_NAME: 'messaging.destination.name',

  // --- exception (used by Span.recordException) ---------------------------
  /** Exception class name. */
  EXCEPTION_TYPE: 'exception.type',
  /** Exception message. */
  EXCEPTION_MESSAGE: 'exception.message',
  /** Exception stack trace. */
  EXCEPTION_STACKTRACE: 'exception.stacktrace',
} as const;

/** Any of the well-known attribute keys in {@link SemConv}. */
export type SemConvKey = typeof SemConv[keyof typeof SemConv];
