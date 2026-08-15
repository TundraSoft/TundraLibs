/**
 * @fileoverview Tests for the cross-runtime UDP sender.
 *
 * Besides the happy path, this pins the failure mode on runtimes without
 * datagram sockets: `udpSocket()` must REJECT, and reject immediately.
 * On workerd it used to hang forever — `nodejs_compat` sets
 * `process.versions.node`, so the Node branch ran and awaited a bind
 * callback that the runtime's `node:dgram` stand-in never fired. A hang
 * inside a Worker burns the request with no error to trace it by.
 *
 * @module
 */

import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import { assertDatagramBackend, udpSocket } from './udp.ts';
import { isDeno, isNode } from './runtime.ts';
import { join } from './path.ts';

/**
 * How long the child gets before we call it hung. Generous next to an
 * immediate throw and still far below any suite timeout, so a regression
 * reports as a failed assertion rather than a stuck run.
 */
const HANG_LIMIT_MS = 3000;

describe('compat.udp', () => {
  describe('udpSocket', () => {
    it('opens a sender on an ephemeral port', async () => {
      const sock = await udpSocket();
      asserts.assertExists(sock);
      asserts.assertEquals(typeof sock.send, 'function');
      asserts.assertEquals(typeof sock.close, 'function');
      sock.close();
    });

    it('close() is idempotent', async () => {
      const sock = await udpSocket();
      sock.close();
      // Second call must not throw.
      sock.close();
    });

    // Live send/receive round-trip is Deno-only here — Bun + Node use
    // their own native UDP APIs (already covered by other test suites
    // in their respective runtimes). The Deno path exercises the
    // common shape: bind a receiver, fire from the sender, assert
    // the receiver got the bytes.
    if (isDeno) {
      it('delivers a datagram to a bound receiver', async () => {
        const receiver = Deno.listenDatagram({
          transport: 'udp',
          hostname: '127.0.0.1',
          port: 0,
        });
        const localAddr = receiver.addr as Deno.NetAddr;

        try {
          const sock = await udpSocket();
          const payload = 'hello-udp';
          const sent = await sock.send(payload, '127.0.0.1', localAddr.port);
          asserts.assertEquals(sent, payload.length);

          const [bytes, _from] = await receiver.receive();
          asserts.assertEquals(new TextDecoder().decode(bytes), payload);

          sock.close();
        } finally {
          receiver.close();
        }
      });

      it('Uint8Array payloads pass through unchanged', async () => {
        const receiver = Deno.listenDatagram({
          transport: 'udp',
          hostname: '127.0.0.1',
          port: 0,
        });
        const localAddr = receiver.addr as Deno.NetAddr;

        try {
          const sock = await udpSocket();
          const payload = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
          await sock.send(payload, '127.0.0.1', localAddr.port);

          const [bytes] = await receiver.receive();
          asserts.assertEquals(Array.from(bytes), Array.from(payload));

          sock.close();
        } finally {
          receiver.close();
        }
      });

      // The workerd shape can't be reproduced in-process: `isNode` and the
      // `node:dgram` handle are both resolved at import time, and this file
      // has long since imported them. So build the shape in a child —
      // no `Deno`, a `process` claiming a Node version, and a dgram
      // stand-in that swallows the bind callback exactly like workerd's —
      // and watch what `udpSocket()` does. Deno-gated because it spawns
      // that child with `Deno.Command`.
      it('rejects immediately on workerd instead of hanging', async () => {
        const script = `// deno-lint-ignore-file no-explicit-any
const g = globalThis as any;
delete g.Deno;
const stubSocket = {
  on() {},
  once() {},
  removeListener() {},
  send() {},
  close() {},
  bind() {/* never calls back — this is the hang */},
};
Object.defineProperty(g, 'process', {
  value: {
    versions: { node: '22.11.0' },
    getBuiltinModule: (id: string) =>
      id === 'node:dgram' ? { createSocket: () => stubSocket } : undefined,
  },
  configurable: true,
});
Object.defineProperty(g, 'navigator', {
  value: { userAgent: 'Cloudflare-Workers' },
  configurable: true,
});

const { RUNTIME } = await import('../runtime.ts');
const { udpSocket } = await import('../udp.ts');

let timer = 0;
const hung = new Promise((resolve) => {
  timer = setTimeout(() => resolve('HUNG'), ${HANG_LIMIT_MS});
});
const started = Date.now();
let outcome = '';
let message = '';
try {
  outcome = await Promise.race([
    udpSocket({ port: 0 }).then(() => 'RESOLVED'),
    hung,
  ]) as string;
} catch (err) {
  outcome = (err as Error).name;
  message = (err as Error).message;
}
clearTimeout(timer);
console.log(JSON.stringify({
  runtime: RUNTIME,
  outcome,
  message,
  elapsed: Date.now() - started,
}));
`;
        // `fixtures/` is git-ignored and excluded from fmt/lint/test.
        const scriptPath = join(
          import.meta.dirname!,
          'fixtures',
          'workerd-udp.ts',
        );
        await Deno.writeTextFile(scriptPath, script);
        let out;
        try {
          out = await new Deno.Command(Deno.execPath(), {
            args: ['run', '--allow-read', scriptPath],
            stdout: 'piped',
            stderr: 'piped',
          }).output();
        } finally {
          await Deno.remove(scriptPath);
        }

        const stderr = new TextDecoder().decode(out.stderr);
        asserts.assertEquals(out.code, 0, `child process failed:\n${stderr}`);
        const result = JSON.parse(new TextDecoder().decode(out.stdout));

        asserts.assertEquals(
          result.runtime,
          'NODE',
          'workerd looks like Node to the detector — that is the trap this guards',
        );
        asserts.assertNotEquals(
          result.outcome,
          'HUNG',
          `udpSocket() never settled in ${HANG_LIMIT_MS}ms — a hang is worse than a failure, especially inside a Worker request`,
        );
        asserts.assertEquals(
          result.outcome,
          'UnsupportedRuntimeError',
          'an unsupported operation must throw, like connect/server/watch do',
        );
        asserts.assertStringIncludes(result.message, 'udpSocket');
        asserts.assert(
          result.elapsed < HANG_LIMIT_MS,
          `the rejection must be immediate, took ${result.elapsed}ms`,
        );
      });
    }
  });

  describe('assertDatagramBackend', () => {
    // The guard is unreachable on a real Node (>= 22.3 always supplies
    // node:dgram), so it is exercised through its `candidate` seam. What
    // it prevents is the hang: without it the Node path builds a socket
    // on `undefined` and awaits a bind callback that never fires.
    it('throws when the runtime supplies no datagram backend', () => {
      // NOT `undefined` — that triggers the default parameter and
      // resolves to the runtime's real module, so the call correctly
      // does not throw on Node. `null` and the other falsy values are
      // what an absent backend actually looks like through the seam.
      for (const absent of [null, false, 0, '']) {
        asserts.assertThrows(
          () => assertDatagramBackend(absent),
          Error,
          'node:dgram',
        );
      }
    });

    it('accepts a backend that is present', () => {
      assertDatagramBackend({ createSocket: () => {} });
    });

    it('an explicit undefined falls through to the runtime default', () => {
      // Default parameters fire on `undefined`, so this is NOT a way to
      // simulate an absent backend — it asks for the runtime's own. The
      // outcome therefore has to match the no-argument call exactly.
      const viaDefault = (() => {
        try {
          assertDatagramBackend();
          return 'ok';
        } catch {
          return 'threw';
        }
      })();
      const viaUndefined = (() => {
        try {
          assertDatagramBackend(undefined);
          return 'ok';
        } catch {
          return 'threw';
        }
      })();
      asserts.assertEquals(viaUndefined, viaDefault);
      asserts.assertEquals(viaDefault, isNode ? 'ok' : 'threw');
    });

    it('defaults to the runtime backend', () => {
      // `loadBuiltin('node:dgram', isNode)` only resolves on Node, so the
      // default candidate is the real module there and `undefined` on
      // Deno and Bun (both have native datagram sockets and never reach
      // this guard in practice).
      if (isNode) {
        assertDatagramBackend();
      } else {
        asserts.assertThrows(
          () => assertDatagramBackend(),
          Error,
          'node:dgram',
        );
      }
    });
  });
});
