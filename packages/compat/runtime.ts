/**
 * @fileoverview Cross-runtime detection and environment utilities.
 *
 * Detects the current JavaScript runtime (Deno, Bun, Node.js, Cloudflare
 * Workers, browsers) and operating system. Provides utilities for
 * environment variables, working directory, and process information.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { RUNTIME, isDeno, getEnv } from '@tundralibs/compat/runtime';
 *
 * if (isDeno) {
 *   console.log('Running on Deno');
 * }
 * ```
 */

import { loadBuiltin } from './_runtime-globals.ts';

/**
 * Detected JavaScript runtime. `'WORKERS'` is Cloudflare Workers
 * (workerd); `'BROWSER'` is a browser or web/service worker;
 * `'UNKNOWN'` is anything else.
 */
export type Runtime =
  | 'DENO'
  | 'BUN'
  | 'NODE'
  | 'WORKERS'
  | 'BROWSER'
  | 'UNKNOWN';

/** Host operating system, normalised across runtimes. */
export type OperatingSystem = 'WINDOWS' | 'LINUX' | 'DARWIN' | 'UNKNOWN';

/**
 * CPU architecture, normalised across runtimes. Native values fold as:
 * Deno `x86_64`/`aarch64` and Node/Bun `x64`/`arm64`/`ia32`/`arm` →
 * the obvious union member; everything else (`ppc`, `mips`, `riscv64`,
 * `s390x`, …) → `'UNKNOWN'`.
 */
export type Architecture = 'X64' | 'ARM64' | 'X86' | 'ARM' | 'UNKNOWN';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

/** How workerd identifies itself — Cloudflare's documented signal. */
const WORKERD_USER_AGENT = 'Cloudflare-Workers';

/**
 * Detect the JavaScript runtime from a set of globals. Pure and
 * side-effect-free: pass a fake `globals` object to unit-test any
 * outcome without the real runtime.
 *
 * Probe order is deliberate — `DENO → BUN → WORKERS → NODE → BROWSER →
 * UNKNOWN`:
 *
 * - Deno and Bun both expose `process.versions.node`, so they are ruled
 *   out first.
 * - workerd under `nodejs_compat` also exposes `process.versions.node`,
 *   but identifies via `navigator.userAgent`, so it is caught before the
 *   Node test — otherwise it would masquerade as Node and dereference
 *   builtins it lacks.
 * - a jsdom-under-Node environment carries both `document` and
 *   `process.versions.node`; the Node test wins over BROWSER there,
 *   keeping it `'NODE'`.
 */
export function detectRuntime(globals: object = globalThis): Runtime {
  const gg = globals as {
    Deno?: unknown;
    Bun?: unknown;
    navigator?: { userAgent?: string };
    process?: { versions?: { node?: unknown } };
    document?: unknown;
    WorkerGlobalScope?: unknown;
    importScripts?: unknown;
  };
  if (gg.Deno !== undefined) return 'DENO';
  if (gg.Bun !== undefined) return 'BUN';
  if (gg.navigator?.userAgent === WORKERD_USER_AGENT) return 'WORKERS';
  if (gg.process?.versions?.node !== undefined) return 'NODE';
  if (
    typeof gg.document !== 'undefined' ||
    gg.WorkerGlobalScope !== undefined ||
    typeof gg.importScripts === 'function'
  ) {
    return 'BROWSER';
  }
  return 'UNKNOWN';
}

/** Detect the current runtime (see {@link detectRuntime}). */
export function getRuntime(): Runtime {
  return detectRuntime(g);
}

/** Cached {@link getRuntime}, evaluated once at import time. */
export const RUNTIME: Runtime = getRuntime();

/** Whether the current runtime is Deno. */
export const isDeno: boolean = RUNTIME === 'DENO';

/** Whether the current runtime is Bun. */
export const isBun: boolean = RUNTIME === 'BUN';

/**
 * Whether this is **genuine** Node. Deno, Bun and Cloudflare Workers all
 * expose `process.versions.node`, so all three are excluded — on workerd
 * this is `false`, and the Node-gated builtin loads (`node:fs`,
 * `node:http`, …) stay `undefined`, surfacing as an
 * `UnsupportedRuntimeError` at call time rather than a raw `TypeError`
 * on a missing builtin.
 */
export const isNode: boolean = RUNTIME === 'NODE';

/**
 * Whether the current runtime is Cloudflare Workers (workerd), detected
 * via `navigator.userAgent === 'Cloudflare-Workers'`.
 */
export const isWorkers: boolean = RUNTIME === 'WORKERS';

/**
 * Whether the current runtime is a browser or a web/service worker — no
 * Deno/Bun/workerd and no `process.versions.node`, plus a `document` or
 * a worker global scope.
 */
export const isBrowser: boolean = RUNTIME === 'BROWSER';

// `node:os` resolves on all three server runtimes — Deno provides it
// through its Node.js compat layer. Loaded synchronously (see
// {@link loadBuiltin}) so `cpus()`, `totalmem()`, `freemem()`, and
// `uptime()` share a single backend with no per-runtime branching. Stays
// `undefined` on runtimes without `getBuiltinModule` (browsers, workerd)
// so the helpers return safe fallbacks.
const nodeOs: typeof import('node:os') = loadBuiltin('node:os');

// #region Runtime helpers
/** Current process ID, or `undefined` on unknown runtimes. */
export function getProcessId(): number | undefined {
  /* c8 ignore start */
  if (isDeno) return g.Deno.pid;
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) return g.process.pid;
  /* c8 ignore stop */
  return undefined;
}

/** Cached {@link getProcessId}. */
export const PID: number | undefined = getProcessId();

/**
 * Detect the host OS, folding `win32`/`windows` together. Returns
 * `'UNKNOWN'` on any platform outside the supported three, and on
 * runtimes that expose neither `Deno.build` nor `process.platform`.
 *
 * @see {@link OS} for the cached value.
 */
export function getOS(): OperatingSystem {
  const platform = g.Deno?.build?.os ||
    (isNode || isBun ? g.process.platform : undefined);

  switch (platform) {
    case 'windows':
    case 'win32':
      return 'WINDOWS';
    case 'linux':
      return 'LINUX';
    case 'darwin':
      return 'DARWIN';
    default:
      return 'UNKNOWN';
  }
}

/** Cached {@link getOS}. */
export const OS: OperatingSystem = getOS();

/** Detect the CPU architecture (see {@link Architecture} for the mapping). */
export function getArch(): Architecture {
  let raw: string | undefined;
  if (isDeno) raw = g.Deno.build?.arch;
  else if (isBun || isNode) raw = g.process.arch;
  switch (raw) {
    case 'x86_64':
    case 'x64':
      return 'X64';
    case 'aarch64':
    case 'arm64':
      return 'ARM64';
    case 'ia32':
    case 'x86':
      return 'X86';
    case 'arm':
      return 'ARM';
    default:
      return 'UNKNOWN';
  }
}

/** Cached {@link getArch}. */
export const ARCH: Architecture = getArch();

let __env__: Record<string, string> | null = null;
/**
 * Environment variables for the current runtime. Node/Bun return a
 * live reference to `process.env`/`Bun.env`; Deno's snapshot from
 * `Deno.env.toObject()` is cached after the first call.
 */
export const getEnv = (): Record<string, string> => {
  if (!__env__) {
    /* c8 ignore start */
    if (isDeno) __env__ = g.Deno.env.toObject();
    /* c8 ignore stop */
    /* c8 ignore start */
    if (isBun) __env__ = g.Bun.env;
    /* c8 ignore stop */
    /* c8 ignore start */
    if (isNode) __env__ = g.process.env;
    /* c8 ignore stop */
    /* c8 ignore start */
    // workerd populates `process.env` under `nodejs_compat`; use it when
    // it is a real object, otherwise fall through to the empty default.
    // deno-coverage-ignore-start
    if (isWorkers && g.process?.env && typeof g.process.env === 'object') {
      __env__ = g.process.env;
    }
    // deno-coverage-ignore-stop
    /* c8 ignore stop */
    __env__ ??= {};
  }
  return __env__;
};

/** Absolute working directory. Empty string on unknown runtimes. */
export const cwd = (): string => {
  /* c8 ignore start */
  if (isDeno) return g.Deno.cwd();
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) return g.process.cwd();
  /* c8 ignore stop */
  return '';
};

/**
 * Register `handler` to run on process exit (Deno: `unload`,
 * Node/Bun: `process.on('exit')`). Returns a function that detaches
 * the listener. No-op on unknown runtimes.
 *
 * Node/Bun exit listeners are synchronous; async work is dropped.
 * Deno's unload listener can be async but should still complete fast.
 */
export const onExit = (handler: () => void): () => void => {
  /* c8 ignore start */
  if (isDeno) {
    addEventListener('unload', handler);
    return () => removeEventListener('unload', handler);
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    g.process.on('exit', handler);
    return () => g.process.off('exit', handler);
  }
  /* c8 ignore stop */
  // No-op for unknown runtime
  return () => {};
};

/**
 * Register `handler` for uncaught exceptions (Deno: `error` event,
 * Node/Bun: `uncaughtException`). Process state is undefined after
 * an uncaught throw — log and exit; don't try to keep running.
 * Returns a detach function. No-op on unknown runtimes.
 */
export const onError = (handler: (error: Error) => void): () => void => {
  /* c8 ignore start */
  if (isDeno) {
    const errorHandler = (event: ErrorEvent) => {
      handler(event.error);
    };
    addEventListener('error', errorHandler);
    return () => removeEventListener('error', errorHandler);
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    g.process.on('uncaughtException', handler);
    return () => g.process.off('uncaughtException', handler);
  }
  /* c8 ignore stop */
  // No-op for unknown runtime
  return () => {};
};

/**
 * Register `handler` for unhandled promise rejections. Backed by
 * the `unhandledrejection` web event on Deno and `process.on(
 * 'unhandledRejection')` on Node/Bun. Returns a detach function.
 * Treat this as a safety net — handle rejections at their source.
 */
export const onUnhandledRejection = (
  handler: (reason: unknown) => void,
): () => void => {
  /* c8 ignore start */
  if (isDeno) {
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      handler(event.reason);
    };
    addEventListener('unhandledrejection', rejectionHandler);
    return () => removeEventListener('unhandledrejection', rejectionHandler);
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    g.process.on('unhandledRejection', handler);
    return () => g.process.off('unhandledRejection', handler);
  }
  /* c8 ignore stop */
  // No-op for unknown runtime
  return () => {};
};

/**
 * OS signals {@link onSignal} accepts. Windows honours only `SIGINT`
 * and `SIGBREAK`.
 */
export type Signal = 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGBREAK';

/**
 * Register `handler` for an OS signal (Deno: `addSignalListener`,
 * Node/Bun: `process.on`). Returns a detach function. On Windows
 * only `SIGINT` and `SIGBREAK` are reliable.
 */
export const onSignal = (
  signal: Signal,
  handler: () => void,
): () => void => {
  /* c8 ignore start */
  if (isDeno) {
    g.Deno.addSignalListener(signal, handler);
    return () => g.Deno.removeSignalListener(signal, handler);
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    g.process.on(signal, handler);
    return () => g.process.off(signal, handler);
  }
  /* c8 ignore stop */
  // No-op for unknown runtime
  return () => {};
};

/**
 * Terminate the process with `code` (Deno: `Deno.exit`, Node/Bun:
 * `process.exit`). Skips remaining sync/async work — prefer letting
 * the event loop drain naturally and reach for this only when you
 * need to force termination with a specific status.
 *
 * @throws {Error} On unknown runtimes where no exit primitive exists.
 */
export const exit = (code: number = 0): never => {
  /* c8 ignore start */
  if (isDeno) g.Deno.exit(code);
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) g.process.exit(code);
  /* c8 ignore stop */
  // Unknown runtime: no exit primitive available. Avoid importing
  // CompatError here to keep runtime.ts free of intra-package cycles
  // (Error.ts already depends on runtime.ts).
  throw new Error(`exit(${code}) is not supported in ${RUNTIME} runtime`);
};

/**
 * `unref` a timer handle so it does not, on its own, keep the process alive.
 *
 * Node and Bun return a timer object exposing `.unref()`; Deno's
 * `setTimeout`/`setInterval` returns a bare numeric id, unref'd through
 * `Deno.unrefTimer`. On browsers and Cloudflare Workers — where a numeric
 * handle has no unref primitive — this is a safe no-op.
 *
 * Pass the opaque return of `setTimeout`/`setInterval` straight through; no
 * cast needed.
 *
 * @param handle - The value returned by `setTimeout` / `setInterval`.
 */
export const unrefTimer = (handle: unknown): void => {
  if (
    handle !== null && typeof handle === 'object' &&
    typeof (handle as { unref?: unknown }).unref === 'function'
  ) {
    (handle as { unref: () => void }).unref();
    return;
  }
  if (isDeno && typeof handle === 'number') {
    (g.Deno.unrefTimer as (id: number) => void)(handle);
  }
};

/**
 * Logical CPU count (≥ 1). Prefers `os.availableParallelism()` so
 * cgroup quotas under Docker/K8s are respected; falls back to
 * `os.cpus().length` on older Node, `1` on unknown runtimes.
 */
export const cpus = (): number => {
  /* c8 ignore start */
  if (nodeOs) {
    if (typeof nodeOs.availableParallelism === 'function') {
      return nodeOs.availableParallelism();
    }
    return nodeOs.cpus().length;
  }
  /* c8 ignore stop */
  return 1;
};

/** Total system memory, in bytes. `0` on unknown runtimes. */
export const totalmem = (): number => {
  /* c8 ignore start */
  if (nodeOs) return nodeOs.totalmem();
  /* c8 ignore stop */
  return 0;
};

/**
 * Free system memory, in bytes. "Free" differs across OSes — on
 * Linux this excludes reclaimable cached pages, so the value runs
 * smaller than expected. Treat as a hint, not a budget.
 */
export const freemem = (): number => {
  /* c8 ignore start */
  if (nodeOs) return nodeOs.freemem();
  /* c8 ignore stop */
  return 0;
};

/**
 * Host uptime in seconds. *Not* process uptime — use
 * `performance.now() / 1000` for that. `0` on unknown runtimes.
 */
export const uptime = (): number => {
  /* c8 ignore start */
  if (nodeOs) return nodeOs.uptime();
  /* c8 ignore stop */
  return 0;
};

/** Process memory snapshot, in bytes. */
export type MemoryUsage = {
  /** Resident Set Size — total memory mapped for the process. */
  rss: number;
  /** Total committed V8 heap. */
  heapTotal: number;
  heapUsed: number;
  /** V8 "external" memory — C++ objects bound to JS. */
  external: number;
  /**
   * `ArrayBuffer` / `SharedArrayBuffer` backing memory. `0` on Deno
   * (not exposed by `Deno.memoryUsage`) and unknown runtimes.
   */
  arrayBuffers: number;
};

/**
 * Snapshot the process's memory. Each call walks V8 internals —
 * cheap but not free; sample on an interval, don't call in tight
 * loops. All fields are `0` on unknown runtimes.
 */
export const memoryUsage = (): MemoryUsage => {
  /* c8 ignore start */
  if (isDeno) {
    const m = g.Deno.memoryUsage?.();
    return {
      rss: m?.rss ?? 0,
      heapTotal: m?.heapTotal ?? 0,
      heapUsed: m?.heapUsed ?? 0,
      external: m?.external ?? 0,
      arrayBuffers: 0,
    };
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    const m = g.process.memoryUsage();
    return {
      rss: m.rss,
      heapTotal: m.heapTotal,
      heapUsed: m.heapUsed,
      external: m.external,
      arrayBuffers: m.arrayBuffers ?? 0,
    };
  }
  /* c8 ignore stop */
  return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
};
// #endregion Runtime helpers
