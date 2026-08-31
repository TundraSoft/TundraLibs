/**
 * @fileoverview `@tundralibs/rapid/testing` — the test harness. Re-exports
 * compat/test's lifecycle so a test file imports everything from here, and
 * adds `harness()` (boot the module system with fakes, restored on
 * dispose) and `client()` (drive routes through `app.fetch`, no port).
 *
 * @example
 * ```ts ignore
 * import { afterAll, beforeAll, describe, it, harness, client } from '@tundralibs/rapid/testing';
 * ```
 * @module
 */

import {
  Doctor,
  type DoctorContainer,
  type Label,
  type VialClass,
} from '@tundralibs/doctor';
import { initModules } from '../modules/mod.ts';
import type {
  RapidModuleEventMap,
  RapidModuleInitOptions,
  RapidModuleInitResult,
  RapidModuleSources,
  RapidView,
} from '../types/mod.ts';
import type { RapidModule } from '../modules/mod.ts';
import type { Application } from '../Application.ts';
import type { ModuleRuntime } from '../modules/mod.ts';

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  test,
} from '@tundralibs/compat/test';

/** A doctor stub — a `[token, value]` pair, restored (revoked) on dispose. */
export type Stub = readonly [VialClass | Label | string, unknown];

/** Options for {@link harness}. */
export type HarnessOptions<
  M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>> = Record<
    never,
    RapidModule<RapidModuleEventMap>
  >,
> = RapidModuleSources<M, I> & {
  /** Boot context; defaults to a quiet in-memory logger. */
  context?: RapidModuleInitOptions;
  /** Fakes stocked in the harness container before boot, revoked on dispose. */
  stub?: readonly Stub[];
  /**
   * Container the modules boot through and the stubs are stocked into.
   * Defaults to a FRESH child of the global `Doctor`, so a test never
   * touches (or leaks into) the process-wide registry. Pass an app's
   * `container` to boot against exactly what that app would resolve.
   */
  container?: DoctorContainer;
};

/** What {@link harness} returns — the booted modules plus test conveniences. */
export type Harness<
  M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>>,
> = RapidModuleInitResult<M, I> & {
  /** `runtime.invoke`, bound. */
  invoke: ModuleRuntime['invoke'];
  /** Dispose the runtime and revoke every stub. */
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

/**
 * Boot the module system for a test: stock the fakes into an isolated
 * container, run `initModules`, and hand back
 * `{ modules, runtime, invoke, dispose }`. Call in `beforeAll` and
 * `dispose()` in `afterAll`, or `await using`. Stubs land in a FRESH
 * child of the global `Doctor` by default (pass `container` to override),
 * so a test never mutates the process-wide registry and cannot leak into
 * the next; `dispose` still revokes them, which matters only when you
 * pass your own container.
 */
export async function harness<
  const M extends readonly object[],
  I extends Record<string, RapidModule<RapidModuleEventMap>> = Record<
    never,
    RapidModule<RapidModuleEventMap>
  >,
>(options: HarnessOptions<M, I>): Promise<Harness<M, I>> {
  const container = options.container ?? Doctor.createContainer();
  const stubbed: (VialClass | Label | string)[] = [];
  for (const [token, value] of options.stub ?? []) {
    container.revoke(token); // clear any prior local override before re-stocking
    // deno-lint-ignore no-explicit-any
    container.stock(token as any, value as any);
    stubbed.push(token);
  }
  let result: RapidModuleInitResult<M, I>;
  try {
    result = await initModules(
      options.context ?? { name: 'rapid-test', logger: { handlers: [] } },
      {
        modules: options.modules,
        ...(options.instances ? { instances: options.instances } : {}),
      } as RapidModuleSources<M, I>,
      container,
    );
  } catch (error) {
    // Boot failure is a common thing a test exercises — revoke the stubs so a
    // caller-supplied container is left as it was (dispose() isn't returned on
    // this path; a defaulted container is discarded anyway).
    for (const token of stubbed) container.revoke(token);
    throw error;
  }
  const dispose = async (): Promise<void> => {
    await result.runtime.dispose();
    for (const token of stubbed) container.revoke(token);
  };
  return {
    ...result,
    invoke: result.runtime.invoke.bind(result.runtime),
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}

/** A parsed response: `status`, the auto-decoded `body`, and `headers`. */
export type TestResponse = {
  status: number;
  headers: Headers;
  body: unknown;
};

/** Per-call options for a {@link client} request. */
export type ClientOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /**
   * Send the request as a SWAP — sets the app's RESOLVED swap header
   * (`app.ui({ swapHeader })` or the `rapid-swap` default), so tests of
   * the fragment/page/JSON matrix never hardcode a header name that a
   * later htmx config would silently miss.
   */
  swap?: boolean;
};

type ClientMethod = (
  path: string,
  options?: ClientOptions,
) => Promise<TestResponse>;

/**
 * A frozen {@link RapidView} for template unit tests — the same shape
 * `buildView` hands real renders (`render(MyTemplate.render(data,
 * view()))`), with sane defaults so the pairing test never hand-builds
 * the bag. Overrides (and projection extras) merge over the defaults.
 */
export function view(
  overrides: Partial<RapidView> & Record<string, unknown> = {},
): RapidView {
  return Object.freeze({
    requestId: 'test-request',
    runtimePath: '/__rapid/ui.js',
    path: '/',
    asset: (p: string): string => p, // the no-map default: pass-through
    ...overrides,
    // Frozen even when OVERRIDDEN — buildView deep-freezes query, so a
    // template mutating it must fail here, not first in production.
    query: Object.freeze({ ...overrides.query }) as Readonly<
      Record<string, string>
    >,
  });
}

/** A route client over `app.fetch` — no port, JSON in/out, parsed responses. */
export function client(app: Application): Record<
  'get' | 'post' | 'put' | 'patch' | 'delete',
  ClientMethod
> {
  const call = (method: string): ClientMethod => async (path, options = {}) => {
    const url = new URL(path, 'http://rapid.test');
    for (const [k, v] of Object.entries(options.query ?? {})) {
      url.searchParams.set(k, v);
    }
    const init: RequestInit = { method };
    const headers: Record<string, string> = { ...options.headers };
    if (options.swap === true) {
      headers[app.uiOptions?.swapHeader ?? 'rapid-swap'] ??= '1';
    }
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
      headers['content-type'] ??= 'application/json';
    }
    if (Object.keys(headers).length > 0) init.headers = headers;
    const res = await app.fetch(new Request(url, init));
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, headers: res.headers, body };
  };
  return {
    get: call('GET'),
    post: call('POST'),
    put: call('PUT'),
    patch: call('PATCH'),
    delete: call('DELETE'),
  };
}
