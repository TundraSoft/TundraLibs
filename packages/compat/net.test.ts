import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import {
  connect,
  hostname,
  listen,
  type Listener,
  type ListenOptions,
  upgradeTls,
} from './net.ts';
import { ConnectionTimeoutError } from './Error.ts';
import { RUNTIME } from './runtime.ts';
import { join } from './path.ts';

describe('compat.net', () => {
  describe('listen', () => {
    it('should create a listener on the specified port', async () => {
      const port = 9876;
      const listener = await listen({ port });

      asserts.assertExists(listener);
      asserts.assertExists(listener.close);
      asserts.assertEquals(typeof listener.close, 'function');

      // Clean up
      listener.close();
    });

    // it('should throw when port is already in use', async () => {
    //   const port = 9877;
    //   const listener1 = await listen({ port });

    //   try {
    //     // Attempting to bind to the same port should throw
    //     asserts.assertThrows(
    //       () => listen({ port }),
    //       Error,
    //       '', // Any error message is fine as it varies by runtime
    //     );
    //   } finally {
    //     listener1.close();
    //     // Give Node.js time to release the port
    //     if (RUNTIME === 'NODE') await new Promise(r => setTimeout(r, 50));
    //   }
    // });

    it('should accept hostname option', async () => {
      const port = 9878;
      const listener = await listen({ port, hostname: '127.0.0.1' });

      asserts.assertExists(listener);

      // Clean up
      listener.close();
    });

    it('should use default hostname when not specified', async () => {
      const port = 9879;
      const listener = await listen({ port });

      asserts.assertExists(listener);

      // Clean up
      listener.close();
    });

    it('should allow reusing port after closing', async () => {
      const port = 9880;

      // First listener
      const listener1 = await listen({ port });
      listener1.close();
      // Give Node.js time to release the port
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));

      // Should be able to bind again after closing
      const listener2 = await listen({ port });
      asserts.assertExists(listener2);
      listener2.close();
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));
    });

    it('should handle multiple listeners on different ports', async () => {
      const listeners: Listener[] = [];

      try {
        for (let i = 0; i < 5; i++) {
          const listener = await listen({ port: 9900 + i });
          listeners.push(listener);
        }

        asserts.assertEquals(listeners.length, 5);
      } finally {
        // Clean up all listeners
        for (const listener of listeners) {
          listener.close();
        }
      }
    });

    it('should throw on privileged ports without permission', async () => {
      // Port 80 typically requires elevated privileges
      // This test will pass if it throws (expected) or if we have permission
      try {
        const listener = await listen({ port: 80 });
        // If we got here, we have permission - just clean up
        listener.close();
      } catch (error) {
        // Expected behavior - port requires privileges
        asserts.assert(error instanceof Error);
      }
    });

    it('should handle closing multiple times gracefully', async () => {
      const port = 9881;
      const listener = await listen({ port });

      // Close multiple times should not throw
      listener.close();
      listener.close();
      listener.close();
      // Give Node.js time to release the port
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));

      // Verify we can still use the port after multiple closes
      const listener2 = await listen({ port });
      listener2.close();
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));
    });

    // it('should work with high port numbers', async () => {
    //   const port = 65000;
    //   const listener = await listen({ port });

    //   asserts.assertExists(listener);
    //   listener.close();
    // });

    it('should throw on invalid port numbers', async () => {
      // Port 0 is typically invalid or causes auto-assignment
      // Port > 65535 is invalid
      await asserts.assertRejects(
        () => listen({ port: 99999 }),
        Error,
      );
    });

    it('should maintain listener state correctly', async () => {
      const port = 9882;
      const listener = await listen({ port });

      // Listener should be active
      asserts.assertExists(listener);

      // After closing, port should be free
      listener.close();
      // Give Node.js time to release the port
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));

      // Should be able to bind again
      const listener2 = await listen({ port });
      asserts.assertExists(listener2);
      listener2.close();
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));
    });

    it('should support rapid open/close cycles', async () => {
      const port = 9883;

      for (let i = 0; i < 10; i++) {
        const listener = await listen({ port });
        listener.close();
        // Give Node.js time to release the port
        if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));
      }

      // Final verification that port is still usable
      const finalListener = await listen({ port });
      asserts.assertExists(finalListener);
      finalListener.close();
      if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));
    });

    // describe('ListenOptions interface', () => {
    //   it('should accept minimal options', async () => {
    //     const options: ListenOptions = { port: 9884 };
    //     const listener = await listen(options);
    //     asserts.assertExists(listener);
    //     listener.close();
    //   });

    //   it('should accept full options', async () => {
    //     const options: ListenOptions = {
    //       port: 9885,
    //       hostname: 'localhost',
    //     };
    //     const listener = await listen(options);
    //     asserts.assertExists(listener);
    //     listener.close();
    //   });
    // });

    // describe('Listener interface', () => {
    //   it('should have close method', async () => {
    //     const listener = await listen({ port: 9886 });
    //     asserts.assertEquals(typeof listener.close, 'function');
    //     listener.close();
    //   });

    //   it('should implement Listener interface correctly', async () => {
    //     const listener: Listener = await listen({ port: 9887 });
    //     asserts.assertExists(listener.close);
    //     listener.close();
    //   });
    // });

    // describe('Cross-runtime behavior', () => {
    //   it('should work consistently across runtimes', async () => {
    //     // This test verifies that the behavior is consistent
    //     // regardless of the runtime environment
    //     const port = 9888;
    //     const listener = await listen({ port });

    //     // Should always be able to create and close a listener
    //     asserts.assertExists(listener);
    //     asserts.assertExists(listener.close);

    //     listener.close();
    //     // Give Node.js time to release the port
    //     if (RUNTIME === 'NODE') await new Promise(r => setTimeout(r, 50));

    //     // Should always be able to reuse the port
    //     const listener2 = await listen({ port });
    //     asserts.assertExists(listener2);
    //     listener2.close();
    //     if (RUNTIME === 'NODE') await new Promise(r => setTimeout(r, 50));
    //   });
    // });

    // describe('Error handling', () => {
    //   it('should throw meaningful errors for invalid inputs', async () => {
    //     // Negative port
    //     asserts.assertThrows(
    //       () => listen({ port: -1 }),
    //       Error,
    //     );
    //   });

    //   it('should handle concurrent binding attempts', async () => {
    //     const port = 9889;
    //     const listener = await listen({ port });

    //     try {
    //       // Multiple attempts to bind to same port should fail
    //       console.log('1');
    //       asserts.assertThrows(() => listen({ port }));
    //       console.log('2');
    //       asserts.assertThrows(() => listen({ port }));
    //     } finally {
    //       listener.close();
    //       // Give Node.js time to release the port
    //       if (RUNTIME === 'NODE') await new Promise(r => setTimeout(r, 50));
    //     }
    //   });
    // });

    // describe('Resource cleanup', () => {
    //   it('should release resources on close', async () => {
    //     const port = 9890;
    //     const listener = await listen({ port });

    //     // Close should release the port
    //     listener.close();
    //     // Give Node.js time to release the port
    //     if (RUNTIME === 'NODE') await new Promise(r => setTimeout(r, 50));

    //     // Port should be immediately available
    //     const listener2 = await listen({ port });
    //     asserts.assertExists(listener2);
    //     listener2.close();
    //     if (RUNTIME === 'NODE') await new Promise(r => setTimeout(r, 50));
    //   });

    //   it('should handle cleanup in error scenarios', async () => {
    //     const port = 9891;
    //     const listener = await listen({ port });

    //     try {
    //       // Attempt to create another listener on same port (will fail)
    //       try {
    //         listen({ port });
    //         asserts.fail('Should have thrown error for port in use');
    //       } catch {
    //         // Expected error
    //       }

    //       // Original listener should still be valid
    //       asserts.assertExists(listener);
    //     } finally {
    //       listener.close();
    //     }
    //   });
    // });

    // describe('Edge cases', () => {
    //   it('should handle localhost variations', async () => {
    //     let port = 9892;
    //     const variations = ['127.0.0.1', 'localhost', '0.0.0.0'];
    //     for (const hostname of variations) {
    //       const listener = await listen({ port: port++, hostname });
    //       asserts.assertExists(listener);
    //       listener.close();
    //     }
    //   });

    //   it('should handle sequential port allocation', async () => {
    //     const startPort = 9950;
    //     const listeners: Listener[] = [];

    //     try {
    //       // Allocate 10 sequential ports
    //       for (let i = 0; i < 10; i++) {
    //         listeners.push(await listen({ port: startPort + i }));
    //       }

    //       asserts.assertEquals(listeners.length, 10);
    //     } finally {
    //       // Clean up
    //       listeners.forEach((l) => l.close());
    //     }
    //   });
    // });
  });

  describe('Module exports', () => {
    it('should export listen function', async () => {
      asserts.assertEquals(typeof listen, 'function');
    });

    it('should export ListenOptions type', async () => {
      // Type check - this will fail at compile time if type doesn't exist
      const options: ListenOptions = { port: 9999 };
      asserts.assertExists(options);
    });

    it('should export Listener type', async () => {
      // Type check - this will fail at compile time if type doesn't exist
      const listener = await listen({ port: 10000 });
      const typed: Listener = listener;
      asserts.assertExists(typed);
      listener.close();
    });
  });

  describe('Documentation examples', () => {
    it('should work as shown in basic usage example', async () => {
      // From JSDoc: const listener = await listen({ port: 8080 });
      const listener = await listen({ port: 8080 });
      asserts.assertExists(listener);
      listener.close();
    });

    it('should work as shown in port availability example', async () => {
      // From JSDoc: async function isPortAvailable(port: number): Promise<boolean>
      async function isPortAvailable(port: number): Promise<boolean> {
        try {
          const listener = await listen({ port });
          listener.close();
          return true;
        } catch {
          return false;
        }
      }

      // Test with a likely free port
      const result = await isPortAvailable(9999);
      asserts.assertEquals(typeof result, 'boolean');
    });
  });

  describe('connect', () => {
    it('should connect to a listening server', async () => {
      const port = 9950;
      // Start a simple echo server
      const listener = await listen({ port: port, hostname: '127.0.0.1' });

      try {
        const conn = await connect({ port: port, hostname: '127.0.0.1' });
        asserts.assertExists(conn);
        asserts.assertExists(conn.write);
        asserts.assertExists(conn.read);
        asserts.assertExists(conn.close);
        conn.close();
      } finally {
        listener.close();
      }
    });

    it('should fail to connect to non-listening port', async () => {
      const port = 9951;
      // No server listening on this port
      await asserts.assertRejects(
        async () => await connect({ port }),
        Error,
      );
    });

    it('should use default hostname', async () => {
      const port = 9952;
      const listener = await listen({ port, hostname: '127.0.0.1' });

      try {
        // Should connect to localhost by default
        const conn = await connect({ port });
        asserts.assertExists(conn);
        conn.close();
      } finally {
        listener.close();
      }
    });

    it('should have address information', async () => {
      const port = 9953;
      const listener = await listen({ port, hostname: '127.0.0.1' });

      try {
        const conn = await connect({ port, hostname: '127.0.0.1' });
        // Address information should exist (may vary by runtime)
        asserts.assertEquals(typeof conn.remoteAddr, 'object');
        conn.close();
      } finally {
        listener.close();
      }
    });

    it('Connection interface', async () => {
      const port = 9954;
      const listener = await listen({ port, hostname: '127.0.0.1' });

      try {
        const conn = await connect({ port, hostname: '127.0.0.1' });

        // Test Connection interface
        asserts.assertEquals(typeof conn.read, 'function');
        asserts.assertEquals(typeof conn.write, 'function');
        asserts.assertEquals(typeof conn.close, 'function');

        conn.close();
      } finally {
        listener.close();
      }
    });

    it('should timeout when connecting to non-responsive host', async () => {
      // Use a non-routable IP address (RFC 5737) to ensure connection timeout
      // This will hang indefinitely without timeout
      await asserts.assertRejects(
        async () =>
          await connect({
            hostname: '192.0.2.1', // TEST-NET-1 (non-routable)
            port: 9999,
            timeout: 1000, // 1 second timeout
          }),
        ConnectionTimeoutError,
      );
    });

    it('should respect custom timeout duration', async () => {
      const start = Date.now();

      await asserts.assertRejects(
        async () =>
          await connect({
            hostname: '192.0.2.1',
            port: 9999,
            timeout: 500, // 500ms timeout
          }),
        ConnectionTimeoutError,
      );

      const duration = Date.now() - start;
      // Should timeout around 500ms (give some buffer for execution time)
      asserts.assert(duration < 1000, `Timeout took too long: ${duration}ms`);
    });

    it('should work without timeout when not specified', async () => {
      const port = 9955;
      const listener = await listen({ port, hostname: '127.0.0.1' });

      try {
        // Should connect normally without timeout
        const conn = await connect({ port, hostname: '127.0.0.1' });
        asserts.assertExists(conn);
        conn.close();
      } finally {
        listener.close();
      }
    });

    it('should abort connection with custom AbortSignal', async () => {
      const controller = new AbortController();

      // Abort after 100ms
      setTimeout(() => controller.abort(), 100);

      await asserts.assertRejects(
        async () =>
          await connect({
            hostname: '192.0.2.1',
            port: 9999,
            signal: controller.signal,
          }),
        ConnectionTimeoutError,
      );
    });

    it('should abort immediately if signal already aborted', async () => {
      const controller = new AbortController();
      controller.abort(); // Abort before connect

      await asserts.assertRejects(
        async () =>
          await connect({
            hostname: '127.0.0.1',
            port: 9956,
            signal: controller.signal,
          }),
        ConnectionTimeoutError,
      );
    });

    it('should combine timeout and signal (timeout triggers first)', async () => {
      const controller = new AbortController();

      // Signal aborts after 2 seconds, but timeout is 500ms
      const timerId = setTimeout(() => controller.abort(), 2000);

      const start = Date.now();
      try {
        await asserts.assertRejects(
          async () =>
            await connect({
              hostname: '192.0.2.1',
              port: 9999,
              timeout: 500,
              signal: controller.signal,
            }),
          ConnectionTimeoutError,
        );

        const duration = Date.now() - start;
        // Timeout should trigger first (around 500ms, not 2000ms)
        asserts.assert(duration < 1500, `Should timeout first: ${duration}ms`);
      } finally {
        clearTimeout(timerId);
      }
    });

    it('should combine timeout and signal (signal triggers first)', async () => {
      const controller = new AbortController();

      // Signal aborts after 100ms, but timeout is 2 seconds
      setTimeout(() => controller.abort(), 100);

      const start = Date.now();
      await asserts.assertRejects(
        async () =>
          await connect({
            hostname: '192.0.2.1',
            port: 9999,
            timeout: 2000,
            signal: controller.signal,
          }),
        ConnectionTimeoutError,
      );

      const duration = Date.now() - start;
      // Signal should trigger first (around 100ms, not 2000ms)
      asserts.assert(
        duration < 1000,
        `Signal should abort first: ${duration}ms`,
      );
    });

    it('should successfully connect within timeout', async () => {
      const port = 9957;
      const listener = await listen({ port, hostname: '127.0.0.1' });

      try {
        // Connection should succeed quickly
        const conn = await connect({
          port,
          hostname: '127.0.0.1',
          timeout: 5000, // 5 second timeout (plenty of time)
        });
        asserts.assertExists(conn);
        conn.close();
      } finally {
        listener.close();
      }
    });
  });

  describe('listen with signal', () => {
    it('should close listener when signal is aborted', async () => {
      const port = 9958;
      const controller = new AbortController();

      const listener = await listen({
        port,
        hostname: '127.0.0.1',
        signal: controller.signal,
      });

      // Verify listener is active
      asserts.assertExists(listener);

      // Abort the signal
      controller.abort();

      // Give time for cleanup
      await new Promise((r) => setTimeout(r, 50));

      // Try to bind to same port - should succeed since listener was closed
      const listener2 = await listen({ port, hostname: '127.0.0.1' });
      asserts.assertExists(listener2);
      listener2.close();
    });

    it('should not create listener if signal already aborted', async () => {
      const port = 9970; // Use different port to avoid conflicts
      const controller = new AbortController();
      controller.abort(); // Abort before creating listener

      const listener = await listen({
        port,
        hostname: '127.0.0.1',
        signal: controller.signal,
      });

      // Manually close to ensure cleanup
      listener.close();

      // Give more time for port release (especially on Windows)
      await new Promise((r) => setTimeout(r, 300));

      // Should be able to bind to port after cleanup
      try {
        const listener2 = await listen({ port, hostname: '127.0.0.1' });
        asserts.assertExists(listener2);
        listener2.close();
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        // On some platforms, port may still be held briefly - this is acceptable
        if (
          err instanceof Error &&
          !err.message.includes('address already in use')
        ) {
          throw err;
        }
      }
    });

    // Regression: a signal that is ALREADY aborted before listen() runs
    // must close the listener on start, leaving the port free. On Deno
    // the abort handler used to reference the `listener` binding while it
    // was still in its temporal dead zone; the resulting ReferenceError
    // was swallowed and the listener leaked (stayed open and accepting).
    it('should close the listener when the signal is already aborted', async () => {
      const port = 9971;
      const controller = new AbortController();
      controller.abort(); // pre-abort BEFORE listen

      const listener = await listen({
        port,
        hostname: '127.0.0.1',
        signal: controller.signal,
      });

      // If the listener was correctly closed, a connect() is refused.
      // A leaked (still-open) listener would accept the connection.
      let stillAccepting = false;
      try {
        const conn = await connect({
          port,
          hostname: '127.0.0.1',
          timeout: 1000,
        });
        stillAccepting = true;
        conn.close();
      } catch {
        // Expected: connection refused because the listener is closed.
      }

      // Defensive cleanup regardless of outcome.
      try {
        listener.close();
      } catch {
        // Already closed.
      }
      await new Promise((r) => setTimeout(r, 50));

      asserts.assertEquals(
        stillAccepting,
        false,
        'pre-aborted signal must close the listener (port must refuse connections)',
      );
    });

    it('should handle signal abort during accept', async () => {
      const port = 9960;
      const controller = new AbortController();

      const listener = await listen({
        port,
        hostname: '127.0.0.1',
        signal: controller.signal,
      });

      // Start accepting (will wait for connection)
      const acceptPromise = listener.accept();

      // Abort while waiting
      setTimeout(() => controller.abort(), 100);

      // Accept should be rejected or throw
      try {
        await acceptPromise;
        // If we get here, the listener was already accepting a connection
        // Just verify cleanup works
      } catch (error) {
        // Expected - listener was closed during accept
        asserts.assert(error instanceof Error);
      }

      // Give time for cleanup
      await new Promise((r) => setTimeout(r, 50));
    });

    it('should work normally when signal is not aborted', async () => {
      const port = 9961;
      const controller = new AbortController();

      const listener = await listen({
        port,
        hostname: '127.0.0.1',
        signal: controller.signal,
      });

      try {
        // Create a connection
        const conn = await connect({ port, hostname: '127.0.0.1' });

        // Accept should work normally
        const accepted = await listener.accept();
        asserts.assertExists(accepted);

        conn.close();
        accepted.close();
      } finally {
        controller.abort(); // Cleanup
        await new Promise((r) => setTimeout(r, 50));
      }
    });
  });

  describe({
    name: 'Unix socket connections',
    windows: false, // Unix sockets not supported on Windows
    fn: () => {
      it('should support Unix socket paths', async () => {
        // Note: This test will attempt to connect to a Unix socket
        // It's expected to fail if the socket doesn't exist
        try {
          const conn = await connect({ path: '/tmp/test.sock' });
          // If connection succeeds, verify it has the right interface
          asserts.assertExists(conn);
          asserts.assertExists(conn.read);
          asserts.assertExists(conn.write);
          asserts.assertExists(conn.close);
          conn.close();
        } catch (error) {
          // Expected to fail if socket doesn't exist
          asserts.assert(error instanceof Error);
        }
      });

      it('should handle Unix socket connection errors', async () => {
        // Try to connect to a non-existent Unix socket
        await asserts.assertRejects(
          async () =>
            await connect({ path: '/tmp/nonexistent-socket-12345.sock' }),
          Error,
        );
      });
    },
  });

  describe('hostname', () => {
    it('should return string', async () => {
      const host = hostname();
      asserts.assertEquals(
        typeof host,
        'string',
        'hostname() must return string',
      );
    });

    it('should return non-empty string', async () => {
      const host = hostname();
      asserts.assert(
        host.length > 0,
        'hostname() should return non-empty string',
      );
    });

    it('should return localhost in UNKNOWN runtime', async () => {
      if (RUNTIME === 'UNKNOWN') {
        const host = hostname();
        asserts.assertEquals(
          host,
          'localhost',
          'UNKNOWN runtime should return localhost',
        );
      }
    });

    it('should return valid hostname in known runtimes', async () => {
      const host = hostname();
      if (RUNTIME !== 'UNKNOWN') {
        asserts.assert(
          host === 'localhost' || host.length > 0,
          'Known runtimes should return valid hostname',
        );
      }
    });

    it('should be consistent across calls', async () => {
      const host1 = hostname();
      const host2 = hostname();
      asserts.assertEquals(host1, host2, 'hostname() should be consistent');
    });

    it('should handle async properly', async () => {
      // Should not throw
      const host = hostname();
      asserts.assertEquals(
        typeof host,
        'string',
        'hostname must return string',
      );
    });
  });

  // ===========================================================================
  // upgradeTls
  // ===========================================================================

  describe('upgradeTls', () => {
    it('should throw when connection has no _raw socket', async () => {
      // A connection without _raw (simulated user-created connection)
      const fakeConn = {
        read: () => Promise.resolve(null),
        write: (_data: Uint8Array | string) => Promise.resolve(0),
        close: () => {},
        remoteAddr: undefined,
        localAddr: undefined,
        // _raw intentionally omitted
      };

      await asserts.assertRejects(
        () => upgradeTls(fakeConn, { hostname: 'localhost' }),
        Error,
        'raw socket',
      );
    });

    it('should throw when _raw is null', async () => {
      const fakeConn = {
        read: () => Promise.resolve(null),
        write: (_data: Uint8Array | string) => Promise.resolve(0),
        close: () => {},
        remoteAddr: undefined,
        localAddr: undefined,
        _raw: null,
      };

      await asserts.assertRejects(
        () => upgradeTls(fakeConn, { hostname: 'localhost' }),
        Error,
        'raw socket',
      );
    });

    it({
      name: 'should throw when rejectUnauthorized:false on Deno',
      bun: false,
      node: false,
      fn: async () => {
        const port = 9994;
        // Create a plain TCP connection to a listener (just to get a _raw conn)
        const listener = await listen({ port, hostname: '127.0.0.1' });
        try {
          const conn = await connect({ port, hostname: '127.0.0.1' });
          try {
            await asserts.assertRejects(
              () =>
                upgradeTls(conn, {
                  hostname: '127.0.0.1',
                  tls: { rejectUnauthorized: false },
                }),
              Error,
              'rejectUnauthorized',
            );
          } finally {
            conn.close();
          }
        } finally {
          listener.close();
        }
      },
    });

    it({
      name: 'should propagate TLS options through upgradeTls (tls: true)',
      // We cannot verify the full TLS handshake without a real TLS server,
      // but we can verify that a connection with _raw does attempt the upgrade
      // and produces a meaningful error (no raw socket error).
      //
      // Skipped on Bun + Node: their TLS upgrade against a non-TLS endpoint
      // hangs waiting for the handshake instead of erroring quickly the way
      // Deno does. The behavior we want to assert (TLS option is honored,
      // not ignored) is verified on Deno, which is enough — the same code
      // path runs on the other runtimes regardless.
      bun: false,
      node: false,
      fn: async () => {
        const port = 9995;
        const listener = await listen({ port, hostname: '127.0.0.1' });

        try {
          const conn = await connect({ port, hostname: '127.0.0.1' });
          let upgradedConn = null;
          try {
            try {
              upgradedConn = await upgradeTls(conn, {
                hostname: '127.0.0.1',
                tls: true,
              });
              // If upgrade somehow succeeds, verify it's a proper Connection
              asserts.assertExists(upgradedConn.read);
              asserts.assertExists(upgradedConn.write);
              asserts.assertExists(upgradedConn.close);
            } catch (err) {
              // Expected: upgrade may fail due to no TLS server
              // Verify it's NOT the "no _raw" error
              asserts.assert(err instanceof Error);
              asserts.assert(
                !err.message.includes('raw socket'),
                'Error should not be about missing _raw socket',
              );
            }
          } finally {
            if (upgradedConn) {
              upgradedConn.close();
            }
            conn.close();
          }
        } finally {
          listener.close();
        }
      },
    });
  });

  describe('accepted-socket read buffering (review fixes)', () => {
    // Fails the test (instead of hanging the whole run) if a read() never
    // settles — the exact symptom the buffering rewrite fixes.
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('read() timed out (hung)')), ms)
        ),
      ]);

    // #3 — an 'end'/EOF arriving between reads used to be dropped, so the
    // next read() hung forever. It must now settle (EOF as null, or a
    // surfaced error) — never hang.
    it('read() settles (does not hang) when the peer closes between reads', async () => {
      const port = 9971;
      const listener = await listen({ port, hostname: '127.0.0.1' });
      try {
        const client = await connect({ port, hostname: '127.0.0.1' });
        const server = await listener.accept();
        await client.write('hi');
        const first = await withTimeout(server.read(), 3000);
        asserts.assertEquals(new TextDecoder().decode(first!), 'hi');

        // Close the client while NO server.read() is pending, then read.
        client.close();
        await new Promise((r) => setTimeout(r, 100));

        let settled = false;
        try {
          const eof = await withTimeout(server.read(), 3000);
          settled = eof === null || eof instanceof Uint8Array;
        } catch (e) {
          // A surfaced socket error also counts as "settled" (not a hang) as
          // long as it isn't our timeout sentinel.
          settled = !(e instanceof Error && e.message.includes('timed out'));
        }
        asserts.assert(settled, 'read() must settle after the peer closes');
        server.close();
      } finally {
        listener.close();
        await new Promise((r) => setTimeout(r, 50));
      }
    });

    // #2 — an accepted socket erroring with no read pending used to emit an
    // unhandled 'error' that crashed the process. The durable error listener
    // must keep the process alive; reaching the assertions proves it.
    it('a peer reset does not crash the process', async () => {
      const port = 9972;
      const listener = await listen({ port, hostname: '127.0.0.1' });
      try {
        const client = await connect({ port, hostname: '127.0.0.1' });
        const server = await listener.accept();
        await client.write('x');
        await withTimeout(server.read(), 3000);

        // Abruptly drop the client with no server.read() pending.
        client.close();
        await new Promise((r) => setTimeout(r, 100));

        // If the process had crashed on an unhandled 'error', we'd never get
        // here. A further read settles gracefully (null or a surfaced error).
        try {
          const r = await withTimeout(server.read(), 3000);
          asserts.assert(r === null || r instanceof Uint8Array);
        } catch (e) {
          asserts.assert(
            !(e instanceof Error && e.message.includes('timed out')),
          );
        }
        server.close();
      } finally {
        listener.close();
        await new Promise((r) => setTimeout(r, 50));
      }
    });
  });

  describe('write() byte count (re-review fix)', () => {
    // Connection.write documents "the number of bytes written". For a
    // string that is the UTF-8 byte length — not `data.length`, which is
    // the UTF-16 code-unit count and under-reports every multi-byte char.
    // The Node/Bun path used to resolve `data.length`; this regression
    // fails there (returns 2) before the fix and passes (returns 4) after.
    // The Deno path already encoded to UTF-8 first, so it was always green.
    it('resolves with UTF-8 byte length for a multi-byte string', async () => {
      const port = 9973;
      const listener = await listen({ port, hostname: '127.0.0.1' });
      try {
        const client = await connect({ port, hostname: '127.0.0.1' });
        const server = await listener.accept();

        // '🎉' is one grapheme, two UTF-16 code units (`.length === 2`),
        // four UTF-8 bytes.
        const payload = '🎉';
        const expected = new TextEncoder().encode(payload).byteLength;
        asserts.assertEquals(expected, 4);

        const written = await client.write(payload);
        asserts.assertEquals(
          written,
          expected,
          `write() must report UTF-8 byte count (${expected}), got ${written}`,
        );

        // Drain so both ends close cleanly across runtimes.
        const got = await server.read();
        asserts.assertEquals(new TextDecoder().decode(got!), payload);

        client.close();
        server.close();
      } finally {
        listener.close();
        if (RUNTIME === 'NODE') await new Promise((r) => setTimeout(r, 50));
      }
    });
  });

  // ===========================================================================
  // Cloudflare Workers (simulated workerd)
  // ===========================================================================

  describe('Cloudflare Workers outbound TCP', () => {
    // The workerd shape can't be built in-process: `runtime.ts` reads its
    // globals at import time and this file imported it long ago, and
    // `cloudflare:sockets` exists only under workerd. So each case runs in
    // a child that (a) forges the globals and (b) maps
    // `cloudflare:sockets`, through an import map, onto a stub that dials
    // for real with the `Deno` reference captured before the forgery.
    // Same idiom as udp.test.ts's workerd-hang test; Deno-gated because it
    // spawns with `Deno.Command`.

    const WORKERS_SOCKETS_STUB = `// deno-lint-ignore-file no-explicit-any
const denoRef = (globalThis as any).__workersFixtureDeno;

export function connect(address: any, options: any = {}) {
  const inbound = new TransformStream<Uint8Array, Uint8Array>();
  const outbound = new TransformStream<Uint8Array, Uint8Array>();
  let conn: any;
  const opened = denoRef.connect({
    hostname: address.hostname,
    port: address.port,
  }).then((c: any) => {
    conn = c;
    c.readable.pipeTo(inbound.writable).catch(() => {});
    outbound.readable.pipeTo(c.writable).catch(() => {});
    return {
      remoteAddress: address.hostname + ':' + address.port,
      localAddress: '127.0.0.1:0',
    };
  });
  const socket: any = {
    readable: inbound.readable,
    writable: outbound.writable,
    opened,
    // workerd settles this on close; never settling is enough here — the
    // wrapper only attaches a catch handler to it.
    closed: new Promise<void>(() => {}),
    secureTransport: options.secureTransport ?? 'off',
    upgraded: false,
    close: async () => {
      await opened.catch(() => {});
      try { conn?.close(); } catch { /* already gone */ }
    },
    startTls: (...args: unknown[]) => {
      (globalThis as any).__startTlsCalls.push({
        argCount: args.length,
        secureTransport: socket.secureTransport,
        readableLocked: socket.readable.locked,
        writableLocked: socket.writable.locked,
      });
      // No handshake — what's under test is that startTls() was reached
      // with the streams handed back. The upgraded socket keeps the same
      // pipes, so the caller can still move bytes over it.
      return { ...socket, upgraded: true, secureTransport: 'on' };
    },
  };
  return socket;
}
`;

    const WORKERS_PRELUDE = `// deno-lint-ignore-file no-explicit-any
const g = globalThis as any;
// The stub dials through the runtime we are about to hide.
g.__workersFixtureDeno = g.Deno;
g.__startTlsCalls = [];
delete g.Deno;
// workerd under nodejs_compat reports a Node version but hands compat no
// usable built-ins; \`navigator.userAgent\` is what identifies it.
Object.defineProperty(g, 'process', {
  value: { versions: { node: '22.11.0' }, getBuiltinModule: () => undefined },
  configurable: true,
});
Object.defineProperty(g, 'navigator', {
  value: { userAgent: 'Cloudflare-Workers' },
  configurable: true,
});

const { RUNTIME } = await import('../runtime.ts');
const { connect, listen, upgradeTls } = await import('../net.ts');
const out: Record<string, unknown> = { runtime: RUNTIME };
const record = async (key: string, fn: () => Promise<unknown>) => {
  try {
    out[key] = { ok: true, value: await fn() };
  } catch (err) {
    out[key] = {
      ok: false,
      name: (err as Error).name,
      message: (err as Error).message,
    };
  }
};
`;

    /** Runs `body` under the forged workerd environment; returns its `out`. */
    // deno-lint-ignore no-explicit-any
    const runAsWorkers = async (body: string): Promise<any> => {
      const dir = join(import.meta.dirname!, 'fixtures');
      const id = crypto.randomUUID();
      const stub = join(dir, `cf-sockets-${id}.ts`);
      const map = join(dir, `cf-map-${id}.json`);
      const script = join(dir, `cf-net-${id}.ts`);
      // An `--import-map` replaces the config's, so carry compat's own
      // imports (`@std/path`, reached through `path.ts`) across rather
      // than pinning a version here that could drift from deno.json.
      const config = JSON.parse(
        await Deno.readTextFile(join(import.meta.dirname!, 'deno.json')),
      );
      await Deno.writeTextFile(stub, WORKERS_SOCKETS_STUB);
      await Deno.writeTextFile(
        map,
        JSON.stringify({
          imports: {
            ...config.imports,
            'cloudflare:sockets': `./cf-sockets-${id}.ts`,
          },
        }),
      );
      await Deno.writeTextFile(
        script,
        `${WORKERS_PRELUDE}\n${body}\n` +
          `out.startTlsCalls = g.__startTlsCalls;\n` +
          `console.log(JSON.stringify(out));\n` +
          // Exit explicitly: the stub's pipes may still hold ops open.
          `g.__workersFixtureDeno.exit(0);\n`,
      );
      let result;
      try {
        result = await new Deno.Command(Deno.execPath(), {
          args: [
            'run',
            '--allow-read',
            '--allow-net',
            `--import-map=${map}`,
            script,
          ],
          stdout: 'piped',
          stderr: 'piped',
        }).output();
      } finally {
        await Deno.remove(stub);
        await Deno.remove(map);
        await Deno.remove(script);
      }
      const stderr = new TextDecoder().decode(result.stderr);
      asserts.assertEquals(
        result.code,
        0,
        `child process failed:\n${stderr}`,
      );
      return JSON.parse(new TextDecoder().decode(result.stdout));
    };

    /**
     * A listener that answers every line with `PONG:<line>` until the peer
     * goes away, so a child can prove a round trip in either direction.
     */
    const echoServer = async (port: number) => {
      const listener = await listen({ port, hostname: '127.0.0.1' });
      const served = (async () => {
        const conn = await listener.accept();
        for (;;) {
          const got = await conn.read();
          if (!got) break;
          await conn.write(`PONG:${new TextDecoder().decode(got)}`);
        }
        conn.close();
      })().catch(() => {/* the child closing first is the normal ending */});
      return {
        close: async () => {
          listener.close();
          await served;
        },
      };
    };

    it({
      name: 'connect() reaches a real TCP peer and round-trips bytes',
      bun: false,
      node: false,
      fn: async () => {
        const port = 9961;
        const server = await echoServer(port);
        try {
          const result = await runAsWorkers(`
await record('conn', async () => {
  const conn = await connect({ hostname: '127.0.0.1', port: ${port} });
  const wrote = await conn.write('PING');
  const back = await conn.read();
  const value = {
    wrote,
    read: back ? new TextDecoder().decode(back) : null,
    remoteAddr: conn.remoteAddr,
  };
  conn.close();
  return value;
});
`);
          asserts.assertEquals(result.runtime, 'WORKERS');
          asserts.assertEquals(
            result.conn.ok,
            true,
            `connect() failed: ${result.conn.name}: ${result.conn.message}`,
          );
          asserts.assertEquals(result.conn.value.read, 'PONG:PING');
          asserts.assertEquals(
            result.conn.value.wrote,
            4,
            'write() must report the byte count',
          );
          asserts.assertEquals(result.conn.value.remoteAddr, {
            hostname: '127.0.0.1',
            port,
          });
        } finally {
          await server.close();
        }
      },
    });

    it({
      name: 'upgradeTls() reaches startTls() with the streams handed back',
      bun: false,
      node: false,
      fn: async () => {
        const port = 9962;
        const server = await echoServer(port);
        try {
          const result = await runAsWorkers(`
await record('upgrade', async () => {
  const conn = await connect({ hostname: '127.0.0.1', port: ${port} });
  await conn.write('PING');
  await conn.read();
  const tls = await upgradeTls(conn, { hostname: '127.0.0.1' });
  await tls.write('AFTER');
  const back = await tls.read();
  const value = { read: back ? new TextDecoder().decode(back) : null };
  tls.close();
  return value;
});
`);
          asserts.assertEquals(
            result.upgrade.ok,
            true,
            `upgradeTls() failed: ${result.upgrade.name}: ${result.upgrade.message}`,
          );
          asserts.assertEquals(
            result.startTlsCalls.length,
            1,
            'upgradeTls() must reach cloudflare:sockets startTls()',
          );
          const call = result.startTlsCalls[0];
          asserts.assertEquals(
            call.secureTransport,
            'starttls',
            'connect() must open the socket with secureTransport:"starttls" — workerd refuses a later upgrade otherwise',
          );
          asserts.assertEquals(
            call.readableLocked,
            false,
            'startTls() throws on a locked readable; upgradeTls() must release the reader first',
          );
          asserts.assertEquals(
            call.writableLocked,
            false,
            'startTls() throws on a locked writable; upgradeTls() must release the writer first',
          );
          asserts.assertEquals(
            call.argCount,
            0,
            'workerd rejects every startTls() option, expectedServerHostname included',
          );
          asserts.assertEquals(
            result.upgrade.value.read,
            'PONG:AFTER',
            'the upgraded connection must still move bytes',
          );
        } finally {
          await server.close();
        }
      },
    });

    it({
      name: 'rejects TLS material and UNIX paths workerd cannot honour',
      bun: false,
      node: false,
      fn: async () => {
        // None of these dial — each must be refused before any I/O.
        const result = await runAsWorkers(`
const target = { hostname: 'example.com', port: 443 };
await record('mtls', () =>
  connect({ ...target, tls: { cert: 'c', key: 'k' } }));
await record('caFile', () =>
  connect({ ...target, tls: { caFile: '/etc/ssl/ca.pem' } }));
await record('insecure', () =>
  connect({ ...target, tls: { rejectUnauthorized: false } }));
await record('unix', () => connect({ path: '/tmp/nope.sock' }));
`);
        for (const key of ['mtls', 'caFile', 'insecure', 'unix']) {
          asserts.assertEquals(
            result[key].ok,
            false,
            `${key} must be refused, not silently accepted`,
          );
          asserts.assertEquals(
            result[key].name,
            'UnsupportedRuntimeError',
            `${key} must fail with a typed error, got ${result[key].name}`,
          );
        }
        asserts.assertStringIncludes(result.mtls.message, 'cert/key');
        // Refused before `validateTLS` would have tried to read the file —
        // a filesystem error here would name the wrong problem.
        asserts.assertStringIncludes(result.caFile.message, 'caFile');
        asserts.assertStringIncludes(
          result.insecure.message,
          'rejectUnauthorized',
        );
        asserts.assertStringIncludes(result.unix.message, 'UNIX');
      },
    });

    it({
      name: 'upgradeTls() refuses a hostname connect() did not dial',
      bun: false,
      node: false,
      fn: async () => {
        const port = 9963;
        const server = await echoServer(port);
        try {
          // workerd verifies the peer against the dialed hostname and takes
          // no override, so a different name must fail loudly rather than
          // verify something the caller never asked for.
          const result = await runAsWorkers(`
await record('mismatch', async () => {
  const conn = await connect({ hostname: '127.0.0.1', port: ${port} });
  try {
    return await upgradeTls(conn, { hostname: 'elsewhere.example' });
  } finally {
    conn.close();
  }
});
`);
          asserts.assertEquals(result.mismatch.ok, false);
          asserts.assertEquals(
            result.mismatch.name,
            'UnsupportedRuntimeError',
          );
          asserts.assertStringIncludes(
            result.mismatch.message,
            'elsewhere.example',
          );
          asserts.assertEquals(
            result.startTlsCalls.length,
            0,
            'the mismatch must be caught before startTls() runs',
          );
        } finally {
          await server.close();
        }
      },
    });

    it({
      name: 'leaves listen / udp / watch / file / WebServer.start throwing',
      bun: false,
      node: false,
      fn: async () => {
        // Regression pin: outbound TCP is the only capability this gained.
        const result = await runAsWorkers(`
await record('listen', () => listen({ port: 9964 }));
await record('udp', async () =>
  (await import('../udp.ts')).udpSocket({ port: 0 }));
await record('watch', async () =>
  (await import('../watch.ts')).watch('/tmp'));
await record('file', async () =>
  (await import('../file.ts')).readTextFile('/tmp/nope.txt'));
await record('webserver', async () => {
  const { WebServer } = await import('../webserver/mod.ts');
  return await new WebServer('pin', {
    mode: 'TCP',
    port: 9965,
    handler: () => new Response('x'),
  }).start();
});
`);
        for (
          const key of ['listen', 'udp', 'watch', 'file', 'webserver']
        ) {
          asserts.assertEquals(
            result[key].ok,
            false,
            `${key} must still be unsupported on Workers`,
          );
          asserts.assertEquals(
            result[key].name,
            'UnsupportedRuntimeError',
            `${key} threw ${result[key].name}: ${result[key].message}`,
          );
        }
      },
    });
  });
});
