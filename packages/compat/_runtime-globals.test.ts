/**
 * @fileoverview Tests for the runtime-global accessors.
 *
 * {@link loadBuiltin} is the seam that lets every other module in the
 * package reach a Node built-in *synchronously*. Getting it wrong
 * reintroduces the top-level await that async-poisons consumer bundles,
 * so its contract is pinned here: never throw, and return `undefined`
 * — not a rejected promise, not an exception — on every runtime or
 * specifier that can't supply the module.
 *
 * @module
 */

import { describe, it } from './test.ts';
import { Bun, loadBuiltin } from './_runtime-globals.ts';
import { isBun } from './runtime.ts';
import * as asserts from '@std/asserts';

/**
 * Run `fn` with `globalThis.process` replaced by `stub`, restoring the
 * original property descriptor afterwards.
 *
 * Deno and Node define `process` as a configurable accessor and Bun as a
 * configurable data property, so the swap works everywhere — but it is a
 * global, so `fn` stays synchronous and the restore lives in a `finally`
 * to keep the stub from leaking into sibling tests (Bun runs a file's
 * tests in one process).
 */
const withProcess = <T>(stub: unknown, fn: () => T): T => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'process');
  Object.defineProperty(globalThis, 'process', {
    value: stub,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'process', original);
    } else {
      delete (globalThis as Record<string, unknown>).process;
    }
  }
};

describe({
  name: 'compat._runtime-globals',
  fn: () => {
    describe('Bun', () => {
      it('is the Bun global on Bun and undefined elsewhere', () => {
        asserts.assertEquals(
          Bun !== undefined,
          isBun,
          'Bun accessor must track the runtime',
        );
      });
    });

    describe('loadBuiltin', () => {
      it('resolves a built-in synchronously — no promise', () => {
        const os = loadBuiltin('node:os');
        asserts.assertEquals(
          typeof os?.hostname,
          'function',
          'node:os must resolve to the real module',
        );
        asserts.assertEquals(
          os instanceof Promise,
          false,
          'must not be a promise — sync callers deref it immediately',
        );
      });

      it('returns the same namespace on repeat calls', () => {
        asserts.assertStrictEquals(
          loadBuiltin('node:path'),
          loadBuiltin('node:path'),
          'built-ins are cached by the runtime, not re-instantiated',
        );
      });

      it('returns undefined when the `when` guard is false', () => {
        asserts.assertEquals(
          loadBuiltin('node:os', false),
          undefined,
          'a false guard must skip the load entirely',
        );
      });

      it('loads when the `when` guard is true', () => {
        asserts.assertEquals(
          typeof loadBuiltin('node:os', true)?.hostname,
          'function',
        );
      });

      it('returns undefined for a specifier that is no built-in', () => {
        asserts.assertEquals(
          loadBuiltin('node:not-a-real-builtin'),
          undefined,
          'unknown built-ins resolve to undefined, they do not throw',
        );
      });

      it('returns undefined when process has no getBuiltinModule', () => {
        // Node < 22.3 / Bun < 1.1.31 shaped runtime: `process` exists but
        // the hook doesn't.
        const result = withProcess(
          { versions: { node: '20.0.0' } },
          () => loadBuiltin('node:os'),
        );
        asserts.assertEquals(result, undefined);
      });

      it('returns undefined when there is no process global', () => {
        // Browser / workerd-shaped runtime: nothing to load from. This is
        // the path that must stay quiet — throwing here would move the
        // failure from call time to *import* time and break the bundle.
        const result = withProcess(undefined, () => loadBuiltin('node:fs'));
        asserts.assertEquals(result, undefined);
      });

      it('restores the real process global after stubbing', () => {
        withProcess(undefined, () => loadBuiltin('node:os'));
        asserts.assertEquals(
          typeof loadBuiltin('node:os')?.hostname,
          'function',
          'the stub must not leak into sibling tests',
        );
      });
    });
  },
});
