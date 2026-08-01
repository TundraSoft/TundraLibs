/**
 * @fileoverview Cross-runtime BDD shims (`describe` / `it` / hooks)
 * that delegate to the native test runner — `@std/testing/bdd` on
 * Deno, `bun:test` on Bun, `node:test` on Node — and add
 * runtime/OS filtering and Deno permission flags via an options form.
 *
 * @module
 */

import { isBun, isDeno, isNode, OS, RUNTIME } from './runtime.ts';
import type { PermissionName } from './permissions.ts';
import { UnsupportedRuntimeError } from './Error.ts';

/**
 * Per-permission setting for the Deno test runner.
 * `'inherit'` mirrors the parent process; `boolean` toggles the
 * permission wholesale; `string[]` scopes it (e.g. `['./data']`).
 */
export type PermissionOptions = {
  [K in PermissionName]?: 'inherit' | boolean | string[];
};

/**
 * Test config. Setting a runtime/OS flag to `false` skips the test on
 * that runtime/OS — e.g. `{ deno: false, node: false }` runs Bun-only.
 */
export type ItOptions = {
  name?: string;
  fn?: () => void | Promise<void>;
  ignore?: boolean;
  only?: boolean;
  deno?: boolean;
  bun?: boolean;
  node?: boolean;
  windows?: boolean;
  linux?: boolean;
  darwin?: boolean;
};

export type HookFn<T = unknown> = (this: T) => void | Promise<void>;

/**
 * Suite config: extends {@link ItOptions} with hooks and Deno-only
 * `permissions` / `sanitize*` flags. The sanitize flags are ignored
 * on Bun and Node.
 */
export type DescribeOptions<T = unknown> = ItOptions & {
  permissions?: PermissionOptions;
  sanitizeOps?: boolean;
  sanitizeResources?: boolean;
  sanitizeExit?: boolean;
  beforeAll?: HookFn<T>;
  afterAll?: HookFn<T>;
  beforeEach?: HookFn<T>;
  afterEach?: HookFn<T>;
};

// =============================================================================
// Import native implementations
// =============================================================================

// deno-lint-ignore no-explicit-any
let bdd: any;
// deno-lint-ignore no-explicit-any
let bunTest: any;
// deno-lint-ignore no-explicit-any
let nodeTest: any;

/* c8 ignore start */
if (isDeno) {
  bdd = await import('@std/testing/bdd');
}
/* c8 ignore stop */

/* c8 ignore start */
if (isBun) {
  bunTest = await import('bun:test');
}
/* c8 ignore stop */

/* c8 ignore start */
if (isNode) {
  nodeTest = await import('node:test');
}
/* c8 ignore stop */

// =============================================================================
// Helper functions
// =============================================================================

/** Resolve {@link ItOptions}'s `ignore`/runtime/OS flags into a single skip decision. @internal */
function shouldIgnore(options: ItOptions): boolean {
  // If explicitly ignored, return true
  if (options.ignore === true) return true;

  // Check runtime filters - if option is false and we're in that runtime, ignore
  if (options.deno === false && RUNTIME === 'DENO') return true;
  if (options.bun === false && RUNTIME === 'BUN') return true;
  if (options.node === false && RUNTIME === 'NODE') return true;

  // Check OS filters - if option is false and we're on that OS, ignore
  if (options.windows === false && OS === 'WINDOWS') return true;
  if (options.linux === false && OS === 'LINUX') return true;
  if (options.darwin === false && OS === 'DARWIN') return true;

  return false;
}

// =============================================================================
// Test functions
// =============================================================================

/**
 * Declare a test suite. Use `describe(name, fn)` for the plain form,
 * or `describe(opts)` to pass {@link DescribeOptions} (filters,
 * Deno permissions, hooks).
 *
 * @throws {@link UnsupportedRuntimeError} On unknown runtimes.
 */
export function describe(name: string, fn: () => void | Promise<void>): void;
export function describe<T = unknown>(options: DescribeOptions<T>): void;
export function describe<T = unknown>( // NOSONAR - complexity will be there.
  nameOrOptions: string | DescribeOptions<T>,
  maybeFn?: () => void | Promise<void>,
): void {
  const isString = typeof nameOrOptions === 'string';
  const name = isString ? nameOrOptions : nameOrOptions.name!;
  const fn = isString ? maybeFn! : nameOrOptions.fn!;
  const options = isString ? {} : nameOrOptions;

  const ignore = shouldIgnore(options);

  // Wrap the fn to register hooks if they're provided in options
  const wrappedFn = () => {
    if (options.beforeAll) beforeAll(options.beforeAll as HookFn);
    if (options.beforeEach) beforeEach(options.beforeEach as HookFn);
    if (options.afterEach) afterEach(options.afterEach as HookFn);
    if (options.afterAll) afterAll(options.afterAll as HookFn);
    return fn();
  };

  /* c8 ignore start */
  if (isDeno && bdd) {
    const denoOpts: Record<string, unknown> = { ignore };

    // Add Deno-specific options only in Deno
    if (options.permissions) denoOpts.permissions = options.permissions;
    if (options.sanitizeOps !== undefined) {
      denoOpts.sanitizeOps = options.sanitizeOps;
    }
    if (options.sanitizeResources !== undefined) {
      denoOpts.sanitizeResources = options.sanitizeResources;
    }
    if (options.sanitizeExit !== undefined) {
      denoOpts.sanitizeExit = options.sanitizeExit;
    }
    if (options.only) denoOpts.only = options.only;
    bdd.describe(name, denoOpts, wrappedFn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun && bunTest) {
    if (ignore) {
      bunTest.describe.skip(name, wrappedFn);
      return;
    }
    if (options.only) {
      bunTest.describe.only(name, wrappedFn);
      return;
    }
    bunTest.describe(name, wrappedFn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isNode && nodeTest) {
    if (ignore) {
      nodeTest.describe.skip(name, wrappedFn);
      return;
    }
    if (options.only) {
      nodeTest.describe.only(name, wrappedFn);
      return;
    }
    nodeTest.describe(name, wrappedFn);
    return;
  }
  /* c8 ignore stop */

  throw new UnsupportedRuntimeError('describe');
}

/** Skip the entire suite (and its children). */
describe.skip = function (name: string, fn: () => void | Promise<void>): void {
  describe({ name, fn, ignore: true });
};

/** Focus mode — only this suite (and other `.only`s) run. */
describe.only = function (name: string, fn: () => void | Promise<void>): void {
  describe({ name, fn, only: true });
};

/**
 * Declare a test. Like {@link describe}, but with {@link ItOptions}
 * for the options form. Throws {@link UnsupportedRuntimeError} on
 * unknown runtimes.
 */
export function it(name: string, fn: () => void | Promise<void>): void;
export function it(options: ItOptions): void;
export function it( // NOSONAR - complexity will be there.
  nameOrOptions: string | ItOptions,
  maybeFn?: () => void | Promise<void>,
): void {
  const isString = typeof nameOrOptions === 'string';
  const name = isString ? nameOrOptions : nameOrOptions.name!;
  const fn = isString ? maybeFn! : nameOrOptions.fn!;
  const options = isString ? {} : nameOrOptions;

  const ignore = shouldIgnore(options);

  /* c8 ignore start */
  if (isDeno && bdd) {
    const denoOpts: Record<string, unknown> = { ignore };
    if (options.only) denoOpts.only = options.only;

    bdd.it(name, denoOpts, fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun && bunTest) {
    if (ignore) {
      bunTest.it.skip(name, fn);
      return;
    }
    if (options.only) {
      bunTest.it.only(name, fn);
      return;
    }
    bunTest.it(name, fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isNode && nodeTest) {
    if (ignore) {
      nodeTest.it.skip(name, fn);
      return;
    }
    if (options.only) {
      nodeTest.it.only(name, fn);
      return;
    }
    nodeTest.it(name, fn);
    return;
  }
  /* c8 ignore stop */

  throw new UnsupportedRuntimeError('it');
}

/** Skip this test. */
it.skip = function (name: string, fn: () => void | Promise<void>): void {
  it({ name, fn, ignore: true });
};

/** Focus mode — only this test (and other `.only`s) run. */
it.only = function (name: string, fn: () => void | Promise<void>): void {
  it({ name, fn, only: true });
};

/** Alias for {@link it}. */
export const test = it;

// =============================================================================
// Hooks
// =============================================================================

/** Run `fn` once before any test in the suite. (Node.js: `before`.) */
export function beforeAll(fn: HookFn): void {
  /* c8 ignore start */
  if (isDeno && bdd) {
    bdd.beforeAll(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun && bunTest) {
    bunTest.beforeAll(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isNode && nodeTest) {
    nodeTest.before(fn); // Node.js uses 'before' not 'beforeAll'
    return;
  }
  /* c8 ignore stop */

  throw new UnsupportedRuntimeError('beforeAll');
}

/** Run `fn` once after every test in the suite. (Node.js: `after`.) */
export function afterAll(fn: HookFn): void {
  /* c8 ignore start */
  if (isDeno && bdd) {
    bdd.afterAll(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun && bunTest) {
    bunTest.afterAll(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isNode && nodeTest) {
    nodeTest.after(fn); // Node.js uses 'after' not 'afterAll'
    return;
  }
  /* c8 ignore stop */

  throw new UnsupportedRuntimeError('afterAll');
}

/** Run `fn` before each test in the suite. */
export function beforeEach(fn: HookFn): void {
  /* c8 ignore start */
  if (isDeno && bdd) {
    bdd.beforeEach(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun && bunTest) {
    bunTest.beforeEach(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isNode && nodeTest) {
    nodeTest.beforeEach(fn);
    return;
  }
  /* c8 ignore stop */

  throw new UnsupportedRuntimeError('beforeEach');
}

/** Run `fn` after each test in the suite. */
export function afterEach(fn: HookFn): void {
  /* c8 ignore start */
  if (isDeno && bdd) {
    bdd.afterEach(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun && bunTest) {
    bunTest.afterEach(fn);
    return;
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isNode && nodeTest) {
    nodeTest.afterEach(fn);
    return;
  }
  /* c8 ignore stop */

  throw new UnsupportedRuntimeError('afterEach');
}
