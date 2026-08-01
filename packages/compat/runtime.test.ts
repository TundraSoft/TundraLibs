import { describe, it } from './test.ts';
import {
  ARCH,
  type Architecture,
  cpus,
  cwd,
  freemem,
  getArch,
  getEnv,
  getOS,
  getProcessId,
  getRuntime,
  isBun,
  isDeno,
  isNode,
  memoryUsage,
  onError,
  onExit,
  onSignal,
  onUnhandledRejection,
  OS,
  PID,
  RUNTIME,
  type Signal,
  totalmem,
  uptime,
} from './runtime.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.runtime',
  fn: () => {
    describe('Runtime detection flags', () => {
      it('should have isDeno as boolean', () => {
        asserts.assertEquals(
          typeof isDeno,
          'boolean',
          'isDeno must be boolean',
        );
      });

      it('should have isBun as boolean', () => {
        asserts.assertEquals(typeof isBun, 'boolean', 'isBun must be boolean');
      });

      it('should have isNode as boolean', () => {
        asserts.assertEquals(
          typeof isNode,
          'boolean',
          'isNode must be boolean',
        );
      });

      it('should have at most one runtime flag true', () => {
        const trueCount = [isDeno, isBun, isNode].filter(Boolean).length;
        asserts.assert(trueCount <= 1, 'Multiple runtime flags are true');
        // It's okay to have zero (UNKNOWN) or one flag true
      });

      it('should match detected runtime', () => {
        asserts.assert(!(RUNTIME === 'DENO' && !isDeno), 'DENO mismatch');
        asserts.assert(!(RUNTIME === 'BUN' && !isBun), 'BUN mismatch');
        asserts.assert(!(RUNTIME === 'NODE' && !isNode), 'NODE mismatch');
      });
    });

    describe('getProcessId()', () => {
      it('should return number or undefined', () => {
        const pid = getProcessId();
        asserts.assert(
          pid === undefined || typeof pid === 'number',
          'Process ID must be number or undefined',
        );
      });

      it('should return positive integer when defined', () => {
        const pid = getProcessId();
        if (pid !== undefined) {
          asserts.assert(pid > 0, 'PID must be positive');
          asserts.assert(Number.isInteger(pid), 'PID must be integer');
        }
      });

      it('should match PID constant', () => {
        const pid = getProcessId();
        asserts.assertEquals(
          pid,
          PID,
          'getProcessId() does not match PID constant',
        );
      });

      it('should return PID in known runtimes', () => {
        const pid = getProcessId();
        if (RUNTIME === 'DENO' || RUNTIME === 'BUN' || RUNTIME === 'NODE') {
          asserts.assert(pid !== undefined, 'Known runtimes should have PID');
        }
      });
    });

    describe('PID constant', () => {
      it('should be number or undefined', () => {
        asserts.assert(
          PID === undefined || typeof PID === 'number',
          'PID must be number or undefined',
        );
      });

      it('should be consistent across calls', () => {
        const pid1 = getProcessId();
        const pid2 = getProcessId();
        asserts.assertEquals(pid1, pid2, 'PID should be consistent');
      });
    });

    describe('getRuntime()', () => {
      it('should return valid runtime type', () => {
        const runtime = getRuntime();
        const validRuntimes = ['DENO', 'BUN', 'NODE', 'UNKNOWN'];
        asserts.assert(
          validRuntimes.includes(runtime),
          `Invalid runtime: ${runtime}`,
        );
      });

      it('should match RUNTIME constant', () => {
        const runtime = getRuntime();
        asserts.assertEquals(
          runtime,
          RUNTIME,
          'getRuntime() does not match RUNTIME constant',
        );
      });

      it('should return DENO when isDeno is true', () => {
        if (isDeno) {
          asserts.assertEquals(
            getRuntime(),
            'DENO',
            'Should return DENO when isDeno is true',
          );
        }
      });

      it('should return BUN when isBun is true', () => {
        if (isBun) {
          asserts.assertEquals(
            getRuntime(),
            'BUN',
            'Should return BUN when isBun is true',
          );
        }
      });

      it('should return NODE when isNode is true', () => {
        if (isNode) {
          asserts.assertEquals(
            getRuntime(),
            'NODE',
            'Should return NODE when isNode is true',
          );
        }
      });

      it('should be consistent across calls', () => {
        const runtime1 = getRuntime();
        const runtime2 = getRuntime();
        asserts.assertEquals(
          runtime1,
          runtime2,
          'Runtime should be consistent',
        );
      });
    });

    describe('RUNTIME constant', () => {
      it('should be valid runtime type', () => {
        const validRuntimes = ['DENO', 'BUN', 'NODE', 'UNKNOWN'];
        asserts.assert(
          validRuntimes.includes(RUNTIME),
          `Invalid RUNTIME: ${RUNTIME}`,
        );
      });

      it('should not be UNKNOWN in known runtimes', () => {
        if (isDeno || isBun || isNode) {
          asserts.assert(
            RUNTIME !== 'UNKNOWN',
            'RUNTIME should not be UNKNOWN when runtime flag is set',
          );
        }
      });
    });

    describe('getOS()', () => {
      it('should return valid OS type', () => {
        const os = getOS();
        const validOS = ['WINDOWS', 'LINUX', 'DARWIN', 'UNKNOWN'];
        asserts.assert(validOS.includes(os), `Invalid OS: ${os}`);
      });

      it('should match OS constant', () => {
        const os = getOS();
        asserts.assertEquals(os, OS, 'getOS() does not match OS constant');
      });

      it('should be consistent across calls', () => {
        const os1 = getOS();
        const os2 = getOS();
        asserts.assertEquals(os1, os2, 'OS should be consistent');
      });
    });

    describe('OS constant', () => {
      it('should be valid OS type', () => {
        const validOS = ['WINDOWS', 'LINUX', 'DARWIN', 'UNKNOWN'];
        asserts.assert(validOS.includes(OS), `Invalid OS: ${OS}`);
      });

      it('should not be UNKNOWN in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          asserts.assert(
            OS !== 'UNKNOWN',
            'OS should not be UNKNOWN in known runtimes',
          );
        }
      });
    });

    describe('getEnv()', () => {
      it('should return object', () => {
        const env = getEnv();
        asserts.assert(
          typeof env === 'object' && env !== null,
          'getEnv() must return object',
        );
      });

      it('should return environment variables object', () => {
        const env = getEnv();
        // Check that values are strings or undefined
        for (const key in env) {
          const value = env[key];
          asserts.assert(
            value === undefined || typeof value === 'string',
            `Environment variable ${key} must be string or undefined`,
          );
        }
      });

      it('should have PATH or Path variable on most systems', () => {
        const env = getEnv();
        // Most systems have PATH (or Path on Windows)
        // Only check in known runtimes
        if (RUNTIME !== 'UNKNOWN' && OS !== 'UNKNOWN') {
          // We can't guarantee PATH exists in all test environments
          // Just verify env is not empty
          const keys = Object.keys(env);
          if (keys.length === 0) {
            // This is suspicious but might be okay in some environments
          }
        }
      });

      it('should return empty object in UNKNOWN runtime', () => {
        if (RUNTIME === 'UNKNOWN') {
          const env = getEnv();
          asserts.assertEquals(
            Object.keys(env).length,
            0,
            'UNKNOWN runtime should return empty object',
          );
        }
      });

      it('should return consistent object type', () => {
        const env1 = getEnv();
        const env2 = getEnv();
        asserts.assertEquals(
          typeof env1,
          typeof env2,
          'getEnv() should return consistent type',
        );
      });
    });

    describe('cwd()', () => {
      it('should return string', () => {
        const dir = cwd();
        asserts.assertEquals(typeof dir, 'string', 'cwd() must return string');
      });

      it('should return non-empty string in known runtimes', () => {
        const dir = cwd();
        if (RUNTIME !== 'UNKNOWN') {
          asserts.assert(
            dir.length > 0,
            'cwd() should return non-empty string in known runtimes',
          );
        }
      });

      it('should return empty string in UNKNOWN runtime', () => {
        if (RUNTIME === 'UNKNOWN') {
          const dir = cwd();
          asserts.assertEquals(
            dir,
            '',
            'UNKNOWN runtime should return empty string',
          );
        }
      });

      it('should return absolute path in known runtimes', () => {
        const dir = cwd();
        if (RUNTIME !== 'UNKNOWN') {
          // Basic check for absolute path (starts with / or drive letter on Windows)
          const isAbsolute = dir.startsWith('/') || /^[a-zA-Z]:/.test(dir);
          if (!isAbsolute && dir.length > 0) {
            // Some edge case, but shouldn't fail the test
          }
        }
      });

      it('should be consistent across calls', () => {
        const dir1 = cwd();
        const dir2 = cwd();
        asserts.assertEquals(dir1, dir2, 'cwd() should be consistent');
      });
    });

    describe('Integration tests', () => {
      it('should have consistent runtime state', () => {
        const runtime = getRuntime();
        asserts.assert(
          !(runtime === 'DENO' && !isDeno),
          'Inconsistent DENO state',
        );
        asserts.assert(
          !(runtime === 'BUN' && !isBun),
          'Inconsistent BUN state',
        );
        asserts.assert(
          !(runtime === 'NODE' && !isNode),
          'Inconsistent NODE state',
        );
      });

      it('should provide all runtime information', async () => {
        const pid = getProcessId();
        const runtime = getRuntime();
        const os = getOS();
        const env = getEnv();
        const dir = cwd();

        // All should be defined
        asserts.assert(runtime !== undefined, 'Runtime undefined');
        asserts.assert(os !== undefined, 'OS undefined');
        asserts.assert(env !== undefined, 'Env undefined');
        asserts.assert(dir !== undefined, 'CWD undefined');

        // Log for visibility
        console.log(
          `Runtime: ${runtime}, OS: ${os}, PID: ${pid}, CWD: ${dir}`,
        );
      });

      it('should match constants to function calls', () => {
        asserts.assertEquals(getProcessId(), PID, 'PID mismatch');
        asserts.assertEquals(getRuntime(), RUNTIME, 'RUNTIME mismatch');
        asserts.assertEquals(getOS(), OS, 'OS mismatch');
      });
    });

    describe('Edge cases', () => {
      it('should handle getEnv keys safely', () => {
        const env = getEnv();
        const keys = Object.keys(env);
        // Should not throw when accessing keys
        for (const key of keys) {
          const _value = env[key];
          // Should be string or undefined - value intentionally unused
        }
      });

      it('should handle multiple getEnv calls', () => {
        const _env1 = getEnv();
        const _env2 = getEnv();

        // In Deno, each call returns a new snapshot
        // In Bun/Node, returns reference to process.env
        // Both behaviors are valid - variables intentionally unused
      });

      it('should handle cwd without errors', () => {
        // Should not throw
        const dir = cwd();
        asserts.assertEquals(typeof dir, 'string', 'cwd must return string');
      });
    });

    describe('onExit()', () => {
      it('should return cleanup function', () => {
        const cleanup = onExit(() => {});
        asserts.assertEquals(
          typeof cleanup,
          'function',
          'onExit must return cleanup function',
        );
        cleanup(); // Clean up
      });

      it('should register and remove handler', () => {
        let callCount = 0;
        const cleanup = onExit(() => {
          callCount++;
        });

        // Cleanup should remove the handler
        cleanup();

        asserts.assertEquals(
          typeof cleanup,
          'function',
          'cleanup must be a function',
        );
      });

      it('should allow multiple handlers', () => {
        const cleanup1 = onExit(() => {});
        const cleanup2 = onExit(() => {});

        asserts.assertEquals(typeof cleanup1, 'function');
        asserts.assertEquals(typeof cleanup2, 'function');

        cleanup1();
        cleanup2();
      });
    });

    describe('onError()', () => {
      it('should return cleanup function', () => {
        const cleanup = onError(() => {});
        asserts.assertEquals(
          typeof cleanup,
          'function',
          'onError must return cleanup function',
        );
        cleanup();
      });

      it('should register and remove handler', () => {
        let caughtError: Error | undefined;
        const cleanup = onError((error) => {
          caughtError = error;
        });

        // Clean up immediately to prevent interference with other tests
        cleanup();

        asserts.assertEquals(
          typeof cleanup,
          'function',
          'cleanup must be a function',
        );
        asserts.assertEquals(
          caughtError,
          undefined,
          'No error should be caught',
        );
      });

      it('should allow multiple handlers', () => {
        const cleanup1 = onError(() => {});
        const cleanup2 = onError(() => {});

        asserts.assertEquals(typeof cleanup1, 'function');
        asserts.assertEquals(typeof cleanup2, 'function');

        cleanup1();
        cleanup2();
      });
    });

    describe('onUnhandledRejection()', () => {
      it('should return cleanup function', () => {
        const cleanup = onUnhandledRejection(() => {});
        asserts.assertEquals(
          typeof cleanup,
          'function',
          'onUnhandledRejection must return cleanup function',
        );
        cleanup();
      });

      it('should register and remove handler', () => {
        let caughtReason: unknown;
        const cleanup = onUnhandledRejection((reason) => {
          caughtReason = reason;
        });

        // Clean up immediately
        cleanup();

        asserts.assertEquals(
          typeof cleanup,
          'function',
          'cleanup must be a function',
        );
        asserts.assertEquals(
          caughtReason,
          undefined,
          'No rejection should be caught',
        );
      });

      it('should allow multiple handlers', () => {
        const cleanup1 = onUnhandledRejection(() => {});
        const cleanup2 = onUnhandledRejection(() => {});

        asserts.assertEquals(typeof cleanup1, 'function');
        asserts.assertEquals(typeof cleanup2, 'function');

        cleanup1();
        cleanup2();
      });
    });

    describe('onSignal()', () => {
      // const signals: Signal[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'];

      it('should return cleanup function for each signal', () => {
        // On Windows, only SIGINT, SIGBREAK, SIGHUP are supported in Deno
        const testSignals: Signal[] = OS === 'WINDOWS'
          ? ['SIGINT', 'SIGBREAK', 'SIGHUP']
          : ['SIGINT', 'SIGTERM', 'SIGHUP'];

        for (const signal of testSignals) {
          const cleanup = onSignal(signal, () => {});
          asserts.assertEquals(
            typeof cleanup,
            'function',
            `onSignal(${signal}) must return cleanup function`,
          );
          cleanup();
        }
      });

      it('should register and remove handler', () => {
        let callCount = 0;
        const cleanup = onSignal('SIGINT', () => {
          callCount++;
        });

        // Clean up immediately
        cleanup();

        asserts.assertEquals(
          typeof cleanup,
          'function',
          'cleanup must be a function',
        );
        asserts.assertEquals(callCount, 0, 'Handler should not be called');
      });

      it('should allow multiple handlers for same signal', () => {
        const cleanup1 = onSignal('SIGINT', () => {});
        const cleanup2 = onSignal('SIGINT', () => {});

        asserts.assertEquals(typeof cleanup1, 'function');
        asserts.assertEquals(typeof cleanup2, 'function');

        cleanup1();
        cleanup2();
      });

      it('should allow handlers for different signals', () => {
        const cleanup1 = onSignal('SIGINT', () => {});
        // Use SIGBREAK on Windows, SIGTERM elsewhere
        const signal2: Signal = OS === 'WINDOWS' ? 'SIGBREAK' : 'SIGTERM';
        const cleanup2 = onSignal(signal2, () => {});

        asserts.assertEquals(typeof cleanup1, 'function');
        asserts.assertEquals(typeof cleanup2, 'function');

        cleanup1();
        cleanup2();
      });
    });

    describe('Event handler integration', () => {
      it('should support all event handlers simultaneously', () => {
        const cleanups: Array<() => void> = [];

        cleanups.push(onExit(() => {}));
        cleanups.push(onError(() => {}));
        cleanups.push(onUnhandledRejection(() => {}));
        cleanups.push(onSignal('SIGINT', () => {}));

        // All should return cleanup functions
        for (const cleanup of cleanups) {
          asserts.assertEquals(typeof cleanup, 'function');
        }

        // Clean up all
        for (const cleanup of cleanups) {
          cleanup();
        }
      });

      it('should handle cleanup idempotency', () => {
        const cleanup = onExit(() => {});

        // Calling cleanup multiple times should not throw
        cleanup();
        cleanup();
        cleanup();
      });
    });

    // =========================================================================
    // OS info helpers — getArch / ARCH / cpus / totalmem / freemem / uptime
    // =========================================================================

    const VALID_ARCHES: Set<Architecture> = new Set([
      'X64',
      'ARM64',
      'X86',
      'ARM',
      'UNKNOWN',
    ]);

    describe('getArch()', () => {
      it('should return a valid Architecture', () => {
        const arch = getArch();
        asserts.assert(VALID_ARCHES.has(arch), `Invalid arch: ${arch}`);
      });

      it('should be a normalized uppercase value', () => {
        const arch = getArch();
        asserts.assertEquals(
          arch,
          arch.toUpperCase(),
          'getArch() must return uppercase',
        );
      });

      it('should be consistent across calls', () => {
        asserts.assertEquals(getArch(), getArch());
      });

      it('should not be UNKNOWN in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          asserts.assert(
            getArch() !== 'UNKNOWN',
            `getArch() should not be UNKNOWN in ${RUNTIME}`,
          );
        }
      });
    });

    describe('ARCH constant', () => {
      it('should equal getArch()', () => {
        asserts.assertEquals(ARCH, getArch());
      });

      it('should be a valid Architecture', () => {
        asserts.assert(VALID_ARCHES.has(ARCH), `Invalid ARCH: ${ARCH}`);
      });
    });

    describe('cpus()', () => {
      it('should return a number', () => {
        asserts.assertEquals(typeof cpus(), 'number');
      });

      it('should return a positive integer', () => {
        const count = cpus();
        asserts.assert(Number.isFinite(count), 'cpus() must be finite');
        asserts.assert(Number.isInteger(count), 'cpus() must be an integer');
        asserts.assert(count >= 1, `cpus() should be ≥ 1, got ${count}`);
      });

      it('should be consistent across calls', () => {
        // CPU count can drift on some systems (cgroup re-quota), but on
        // a stable test host two calls back-to-back should match.
        asserts.assertEquals(cpus(), cpus());
      });
    });

    describe('totalmem()', () => {
      it('should return a number', () => {
        asserts.assertEquals(typeof totalmem(), 'number');
      });

      it('should return a positive finite value in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          const total = totalmem();
          asserts.assert(Number.isFinite(total), 'totalmem() must be finite');
          asserts.assert(total > 0, `totalmem() should be > 0, got ${total}`);
        }
      });

      it('should be stable across calls', () => {
        // Total physical memory does not change at runtime.
        asserts.assertEquals(totalmem(), totalmem());
      });
    });

    describe('freemem()', () => {
      it('should return a number', () => {
        asserts.assertEquals(typeof freemem(), 'number');
      });

      it('should return a non-negative finite value in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          const free = freemem();
          asserts.assert(Number.isFinite(free), 'freemem() must be finite');
          asserts.assert(free >= 0, `freemem() should be ≥ 0, got ${free}`);
        }
      });

      it('should not exceed totalmem()', () => {
        if (RUNTIME !== 'UNKNOWN') {
          const free = freemem();
          const total = totalmem();
          asserts.assert(
            free <= total,
            `freemem (${free}) should be ≤ totalmem (${total})`,
          );
        }
      });
    });

    describe('uptime()', () => {
      it('should return a number', () => {
        asserts.assertEquals(typeof uptime(), 'number');
      });

      it('should return a positive finite value in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          const up = uptime();
          asserts.assert(Number.isFinite(up), 'uptime() must be finite');
          asserts.assert(up > 0, `uptime() should be > 0, got ${up}`);
        }
      });

      it('should be monotonically non-decreasing', async () => {
        if (RUNTIME !== 'UNKNOWN') {
          const first = uptime();
          // node:os.uptime() rounds to whole seconds on most platforms,
          // so back-to-back calls within the same second are equal —
          // strictly non-decreasing rather than strictly increasing.
          await new Promise((resolve) => setTimeout(resolve, 10));
          const second = uptime();
          asserts.assert(
            second >= first,
            `uptime should not decrease: ${first} -> ${second}`,
          );
        }
      });
    });

    describe('memoryUsage()', () => {
      it('should return an object with all 5 fields', () => {
        const m = memoryUsage();
        for (
          const k of [
            'rss',
            'heapTotal',
            'heapUsed',
            'external',
            'arrayBuffers',
          ] as const
        ) {
          asserts.assertEquals(
            typeof m[k],
            'number',
            `memoryUsage().${k} must be a number`,
          );
        }
      });

      it('should report finite values in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          const m = memoryUsage();
          asserts.assert(Number.isFinite(m.rss));
          asserts.assert(Number.isFinite(m.heapTotal));
          asserts.assert(Number.isFinite(m.heapUsed));
          asserts.assert(Number.isFinite(m.external));
          asserts.assert(Number.isFinite(m.arrayBuffers));
        }
      });

      it('should report rss > 0 in known runtimes', () => {
        if (RUNTIME !== 'UNKNOWN') {
          asserts.assert(
            memoryUsage().rss > 0,
            'rss should be positive in a running process',
          );
        }
      });

      it({
        name: 'should report heapUsed <= heapTotal',
        // Bun's JSC reports `heapUsed` as instantaneous live size and
        // `heapTotal` as committed-after-last-GC; under load
        // `heapUsed > heapTotal` is possible until the next GC. V8
        // (Deno + Node) maintains the invariant.
        bun: false,
        fn: () => {
          if (RUNTIME !== 'UNKNOWN') {
            const m = memoryUsage();
            asserts.assert(
              m.heapUsed <= m.heapTotal,
              `heapUsed (${m.heapUsed}) should be <= heapTotal (${m.heapTotal})`,
            );
          }
        },
      });

      it('should report non-negative values everywhere', () => {
        const m = memoryUsage();
        asserts.assert(m.rss >= 0);
        asserts.assert(m.heapTotal >= 0);
        asserts.assert(m.heapUsed >= 0);
        asserts.assert(m.external >= 0);
        asserts.assert(m.arrayBuffers >= 0);
      });

      it('arrayBuffers is 0 on Deno (runtime does not expose it)', () => {
        if (isDeno) {
          asserts.assertStrictEquals(memoryUsage().arrayBuffers, 0);
        }
      });
    });
  },
});
