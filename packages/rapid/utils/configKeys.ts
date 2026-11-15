/**
 * @fileoverview The keys the application options accept, and the check
 * that finds any other: a misspelt key (`sever:`, `maxBodysize:`) would
 * otherwise be ignored and its default used, silently.
 *
 * @module
 */
import type {
  RapidApplicationOptions,
  RapidApplicationServerOptions,
} from '../types/mod.ts';

/** The keys of one options group; a group value descends, `null` does not. */
type Shape = { readonly [key: string]: Shape | null };

/**
 * A group's keys, checked against its type both ways: a key the type
 * gains must be added here, and a key it does not have cannot be.
 */
const group = <T>(
  shape: { readonly [K in keyof Required<T>]: Shape | null },
): Shape => shape;

type Server = RapidApplicationServerOptions;
type Ui = NonNullable<RapidApplicationOptions['ui']>;

const KEYS = group<RapidApplicationOptions>({
  name: null,
  secret: null,
  mode: null,
  stateMode: null,
  shutdownTimeout: null,
  shutdownSignals: null,
  headers: group<NonNullable<RapidApplicationOptions['headers']>>({
    requestId: null,
    requestIdEcho: null,
    responseTime: null,
  }),
  server: group<Server>({
    enabled: null,
    port: null,
    hostname: null,
    unixSocketPath: null,
    // Keyed by URL prefix, and compat's own options: not rapid's to list.
    static: null,
    tls: null,
    trustProxy: null,
    maxBodySize: null,
    metrics: group<Exclude<Server['metrics'], boolean | undefined>>({
      requests: null,
      errors: null,
      jobs: null,
      sockets: null,
      middleware: null,
      bodies: null,
      ui: null,
    }),
    autoHead: null,
    requireResponse: null,
    methodNotAllowed: null,
    ignoreTrailingSlash: null,
    api: group<NonNullable<Server['api']>>({
      hosts: null,
      prefix: null,
      trustForwardedHost: null,
    }),
    socketPath: null,
    socketOrigins: null,
    paging: group<NonNullable<Server['paging']>>({
      pageHeader: null,
      sizeHeader: null,
      totalHeader: null,
      defaultSize: null,
      maxSize: null,
      maxPage: null,
    }),
    query: group<NonNullable<Server['query']>>({
      maxFilters: null,
      maxSorts: null,
      maxValueLength: null,
      maxArrayItems: null,
    }),
    versioning: group<NonNullable<Server['versioning']>>({
      mode: null,
      identifier: null,
      default: null,
    }),
  }),
  ui: group<Ui>({
    enabled: null,
    runtimePath: null,
    live: null,
    history: null,
    prefer: null,
    csrfCookie: null,
    swapHeader: null,
    swapUnless: null,
    redirectHeader: null,
    compose: group<NonNullable<Ui['compose']>>({
      maxParts: null,
      concurrency: null,
      timeout: null,
    }),
    core: null,
    layout: null,
    view: null,
    errorTemplate: null,
    errorTemplates: null,
    assets: null,
  }),
  uploads: group<NonNullable<RapidApplicationOptions['uploads']>>({
    path: null,
    maxSize: null,
    maxFiles: null,
    allowedExtensions: null,
  }),
  jobs: group<NonNullable<RapidApplicationOptions['jobs']>>({
    enabled: null,
    timezone: null,
  }),
  // slogger's and tracer's own options: theirs to validate.
  logger: null,
  tracer: null,
});

/**
 * The dotted paths of every key in `options` that the application options
 * do not have (`['sever', 'server.maxBodysize']`). A group given as
 * anything but a plain object is left to its own validation.
 */
export function unknownConfigKeys(options: unknown): string[] {
  const unknown: string[] = [];
  const walk = (value: unknown, shape: Shape, path: string): void => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const known = shape[key];
      if (known === undefined) unknown.push(`${path}${key}`);
      else if (known !== null) walk(item, known, `${path}${key}.`);
    }
  };
  walk(options, KEYS, '');
  return unknown;
}
