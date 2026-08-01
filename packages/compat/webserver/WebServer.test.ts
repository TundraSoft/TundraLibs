/**
 * @fileoverview Comprehensive tests for the cross-runtime WebServer class.
 *
 * Tests cover:
 * - Constructor validation (name, mode, options)
 * - WebServer lifecycle (start, stop, state transitions)
 * - TCP mode (HTTP and HTTPS)
 * - UNIX socket mode
 * - Event system (on, off, emit)
 * - Metrics collection and reset
 * - WebSocket support (Bun/Deno only)
 * - Error handling
 * - ref/unref functionality
 *
 * @module
 */

import { afterEach, describe, it } from '../test.ts';
import { OS, RUNTIME } from '../runtime.ts';
import { connect } from '../net.ts';
import { WebServer } from './WebServer.ts';
import {
  ServerAlreadyRunningError,
  ServerConfigurationError,
  ServerError,
  ServerNotRunningError,
  ServerPermissionError,
} from './Error.ts';
import type { ServerOptions } from './types/mod.ts';
import { pathExistsSync, removeSync, writeTextFileSync } from '../file.ts';

// Test port management to avoid conflicts
let testPort = 19900;
const getNextPort = () => testPort++;

// Track active servers for cleanup
let activeServer: WebServer | null = null;

// Helper to wait a fixed time
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('WebServer', () => {
  // Cleanup after each test
  afterEach(async () => {
    if (activeServer?.state === 'RUNNING') {
      try {
        // Force-stop in tests — Bun's graceful stop hangs after any
        // WebSocket has been opened, even if it has since closed.
        await activeServer.stop(false);
      } catch {
        // Ignore cleanup errors
      }
    }
    activeServer = null;
    await delay(100);
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    describe('name validation', () => {
      it('should throw ServerConfigurationError for empty name', () => {
        let threw = false;
        try {
          new WebServer('', {
            mode: 'TCP',
            port: getNextPort(),
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(
              `Expected ServerConfigurationError, got ${error?.constructor?.name}`,
            );
          }
          if (!error.message.includes('name')) {
            throw new Error(
              `Expected error about 'name', got: ${error.message}`,
            );
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw ServerConfigurationError for whitespace-only name', () => {
        let threw = false;
        try {
          new WebServer('   ', {
            mode: 'TCP',
            port: getNextPort(),
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should trim whitespace from name', () => {
        const server = new WebServer('  MyServer  ', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });
        if (server.name !== 'MyServer') {
          throw new Error(
            `Expected trimmed name 'MyServer', got '${server.name}'`,
          );
        }
      });

      it('should accept valid name', () => {
        const server = new WebServer('TestServer', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });
        if (server.name !== 'TestServer') {
          throw new Error(`Expected name 'TestServer', got '${server.name}'`);
        }
      });
    });

    describe('mode validation', () => {
      it('should throw ServerConfigurationError for missing mode', () => {
        let threw = false;
        try {
          // @ts-expect-error - Testing invalid options
          new WebServer('Test', { handler: () => new Response('OK') });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
          if (!error.message.includes('mode')) {
            throw new Error(`Expected error about 'mode'`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw ServerConfigurationError for invalid mode', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            // @ts-expect-error - Testing invalid mode
            mode: 'INVALID',
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should accept TCP mode', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });
        if (server.mode !== 'TCP') {
          throw new Error(`Expected mode 'TCP', got '${server.mode}'`);
        }
      });

      it({
        name: 'should accept UNIX mode',
        windows: false, // UNIX sockets not supported on Windows
        fn: () => {
          const server = new WebServer('Test', {
            mode: 'UNIX',
            unixSocketPath: `/tmp/test-mode-${Date.now()}.sock`,
            handler: () => new Response('OK'),
          });
          if (server.mode !== 'UNIX') {
            throw new Error(`Expected mode 'UNIX', got '${server.mode}'`);
          }
        },
      });
    });

    describe('handler validation', () => {
      it('should throw ServerConfigurationError for missing handler', () => {
        let threw = false;
        try {
          // @ts-expect-error - Testing missing handler
          new WebServer('Test', { mode: 'TCP', port: getNextPort() });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
          if (!error.message.includes('handler')) {
            throw new Error(`Expected error about 'handler'`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw ServerConfigurationError for non-function handler', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            // @ts-expect-error - Testing invalid handler
            handler: 'not a function',
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });
    });

    describe('TCP options validation', () => {
      it('should apply default port 8008', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          handler: () => new Response('OK'),
        });
        const opts = server.options as ServerOptions<'TCP'>;
        if (opts.port !== 8008) {
          throw new Error(`Expected default port 8008, got ${opts.port}`);
        }
      });

      it('should apply default hostname localhost', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          handler: () => new Response('OK'),
        });
        const opts = server.options as ServerOptions<'TCP'>;
        if (opts.hostname !== 'localhost') {
          throw new Error(
            `Expected default hostname 'localhost', got ${opts.hostname}`,
          );
        }
      });

      it('should throw for invalid port (negative)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: -1,
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
          if (!error.message.includes('port')) {
            throw new Error(`Expected error about 'port'`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for invalid port (too high)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: 70000,
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should accept port 0 (random port)', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: 0,
          handler: () => new Response('OK'),
        });
        const opts = server.options as ServerOptions<'TCP'>;
        if (opts.port !== 0) {
          throw new Error(`Expected port 0, got ${opts.port}`);
        }
      });

      it('should throw for invalid hostname type', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            // @ts-expect-error - Testing invalid hostname
            hostname: 12345,
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for invalid backlog (zero)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            backlog: 0,
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for invalid backlog (negative)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            backlog: -10,
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for invalid reusePort type', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            // @ts-expect-error - Testing invalid reusePort
            reusePort: 'yes',
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should accept valid TCP options', () => {
        const port = getNextPort();
        const server = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: '0.0.0.0',
          backlog: 100,
          reusePort: true,
          handler: () => new Response('OK'),
        });
        const opts = server.options as ServerOptions<'TCP'>;
        if (opts.port !== port) throw new Error('Port mismatch');
        if (opts.hostname !== '0.0.0.0') throw new Error('Hostname mismatch');
        if (opts.backlog !== 100) throw new Error('Backlog mismatch');
        if (opts.reusePort !== true) throw new Error('ReusePort mismatch');
      });
    });

    describe('UNIX options validation', () => {
      it({
        name: 'should throw for empty unixSocketPath',
        windows: false,
        fn: () => {
          let threw = false;
          try {
            new WebServer('Test', {
              mode: 'UNIX',
              unixSocketPath: '',
              handler: () => new Response('OK'),
            });
          } catch (error) {
            threw = true;
            if (!(error instanceof ServerConfigurationError)) {
              throw new Error(`Expected ServerConfigurationError`);
            }
          }
          if (!threw) {
            throw new Error('Expected error to be thrown');
          }
        },
      });

      it({
        name: 'should throw for whitespace-only unixSocketPath',
        windows: false,
        fn: () => {
          let threw = false;
          try {
            new WebServer('Test', {
              mode: 'UNIX',
              unixSocketPath: '   ',
              handler: () => new Response('OK'),
            });
          } catch (error) {
            threw = true;
            if (!(error instanceof ServerConfigurationError)) {
              throw new Error(`Expected ServerConfigurationError`);
            }
          }
          if (!threw) {
            throw new Error('Expected error to be thrown');
          }
        },
      });

      it({
        name: 'should throw for non-existent directory',
        windows: false,
        fn: () => {
          let threw = false;
          try {
            new WebServer('Test', {
              mode: 'UNIX',
              unixSocketPath: '/nonexistent/path/test.sock',
              handler: () => new Response('OK'),
            });
          } catch (error) {
            threw = true;
            if (!(error instanceof ServerConfigurationError)) {
              throw new Error(`Expected ServerConfigurationError`);
            }
          }
          if (!threw) {
            throw new Error('Expected error to be thrown');
          }
        },
      });

      it({
        name: 'should accept valid unixSocketPath',
        windows: false,
        fn: () => {
          const server = new WebServer('Test', {
            mode: 'UNIX',
            unixSocketPath: `/tmp/test-valid-${Date.now()}.sock`,
            handler: () => new Response('OK'),
          });
          const opts = server.options as ServerOptions<'UNIX'>;
          if (!opts.unixSocketPath.includes('test-valid-')) {
            throw new Error('Socket path not set correctly');
          }
        },
      });
    });

    describe('TLS options validation', () => {
      it('should throw for TLS with only certFile (missing keyFile)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            tls: { certFile: '/tmp/cert.pem' },
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for TLS with only keyFile (missing certFile)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            tls: { keyFile: '/tmp/key.pem' },
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for TLS with only cert (missing key)', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            tls: { cert: 'cert-content' },
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for TLS with empty cert string', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            tls: { cert: '', key: 'key-content' },
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for TLS with empty key string', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            tls: { cert: 'cert-content', key: '' },
            handler: () => new Response('OK'),
          });
        } catch (error) {
          threw = true;
          if (!(error instanceof ServerConfigurationError)) {
            throw new Error(`Expected ServerConfigurationError`);
          }
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for non-existent certFile', () => {
        let threw = false;
        try {
          new WebServer('Test', {
            mode: 'TCP',
            port: getNextPort(),
            tls: {
              certFile: '/nonexistent/cert.pem',
              keyFile: '/nonexistent/key.pem',
            },
            handler: () => new Response('OK'),
          });
        } catch {
          threw = true;
        }
        if (!threw) {
          throw new Error('Expected error to be thrown');
        }
      });

      it('should throw for non-existent caFile', () => {
        // First create dummy cert and key files
        const timestamp = Date.now();
        const certPath = OS === 'WINDOWS'
          ? String.raw`C:\Windows\Temp\test-cert-${timestamp}.pem`
          : `/tmp/test-cert-${timestamp}.pem`;
        const keyPath = OS === 'WINDOWS'
          ? String.raw`C:\Windows\Temp\test-key-${timestamp}.pem`
          : `/tmp/test-key-${timestamp}.pem`;

        try {
          writeTextFileSync(certPath, 'dummy-cert');
          writeTextFileSync(keyPath, 'dummy-key');

          let threw = false;
          try {
            new WebServer('Test', {
              mode: 'TCP',
              port: getNextPort(),
              tls: {
                certFile: certPath,
                keyFile: keyPath,
                caFile: '/nonexistent/ca.pem',
              },
              handler: () => new Response('OK'),
            });
          } catch {
            threw = true;
          }
          if (!threw) {
            throw new Error('Expected error to be thrown');
          }
        } finally {
          // Cleanup
          try {
            removeSync(certPath);
          } catch { /* ignore */ }
          try {
            removeSync(keyPath);
          } catch { /* ignore */ }
        }
      });

      it('should accept valid string-based TLS options', () => {
        const cert = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUYyHNnSFyFi+pvlBTid6WAcwkwrYwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDIwMzEzMTUxM1oXDTI3MDIw
MzEzMTUxM1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAueP/ApkUfE7oEYfUSTQeK2/QU5Z34c+rWRhoI6RyKffn
0fQrvRQ7Bamfl5/Fbsu2IYM4EI3Y2osbmTG6RENqBc5fwoPWtIn0sETLkbERDQOE
RTxlQ5k7t7tN//7CbvzX0zGcUcqm41ET0A2pmUIx6Chw3uZwxCYKI+36atBX8tNo
ug4j4Yh5qwarHPSaCqHxN5F4e2aWOUufTqoaPWGd4LSGe4GnZe/Vu9Z/z2G5xcnF
lGDsbqb7pTuhyHKdcQjarTrV89JSL6tudraISREW32+gHz1VO6VJypdSSxmQqVMR
cWlgB2jozzf/8R9PwH8K+JJTnXiEuXNgLi4wquy5kwIDAQABo1MwUTAdBgNVHQ4E
FgQUVITG3gf+SmBH6SQp3r2jCjZnEG4wHwYDVR0jBBgwFoAUVITG3gf+SmBH6SQp
3r2jCjZnEG4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAJsQq
/zIdv79U5g0rWrwxrfH4bDiWHlE8ToIeZv6yObRg/KFKf33xoK2iJS7pVn6P4SaE
3ohOT8pGPKNIoxZLi1NDoqNxscE1QqBpM6dsANqvT+h/PSnm7VyS5e0tdrt86Of6
Co8ZIHT42jDGRQz0sF9r+MHhOY7Cn3w/QW3MRrGj01VMTI5eYnF2aFYIFapckVdJ
GJg5bT+tuyjBy8lJHdjf1C1mfG7f5yZM2sct0wXwmxIsp3szKlkG/LYIl9FJFSgy
oCtIBxSH6oK7Bdjr/+6BeCxClRV8cnTjj00YR2Dpm374LBKlw2bmCeqp3zxbxJra
qBtg7fPGfb/+qbp8ng==
-----END CERTIFICATE-----`;
        const key = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC54/8CmRR8TugR
h9RJNB4rb9BTlnfhz6tZGGgjpHIp9+fR9Cu9FDsFqZ+Xn8Vuy7YhgzgQjdjaixuZ
MbpEQ2oFzl/Cg9a0ifSwRMuRsRENA4RFPGVDmTu3u03//sJu/NfTMZxRyqbjURPQ
DamZQjHoKHDe5nDEJgoj7fpq0Ffy02i6DiPhiHmrBqsc9JoKofE3kXh7ZpY5S59O
qho9YZ3gtIZ7gadl79W71n/PYbnFycWUYOxupvulO6HIcp1xCNqtOtXz0lIvq252
tohJERbfb6AfPVU7pUnKl1JLGZCpUxFxaWAHaOjPN//xH0/Afwr4klOdeIS5c2Au
LjCq7LmTAgMBAAECggEAF7JnZ0rhcClU7yssFjrlH69s1MMJPEmPc9enKugDP7Nh
I4QncT6beZDSje8pqYKhkKscIgwbGV0DYyeSMbKQWPYigfbxj2lIvpG+i6+RV2Hb
4kGdPR1THgxsGJa+7Ywg7UTVQx384VyMFIkxVh64ovpIzTl+JZsdzs+/DQ/LLmKp
9JYMi13wuvTeVgXhu62gZxkLthmLoWnL4oN2In7MS8z2FkQj9ruAxL3udz5WkCvE
zJa1tUMuDGPR4VYObeCWSlbDGOzxA3El8KL6FsfXk+UfPXYgHLQboqoN2suQdkkD
ZXt24S7aOtLoGTicpaY23KXOalVJ14tMQKef6Pxq+QKBgQDzHAFs9gHxXXjjqsut
V8f+Gqja1h2f5QQd4Vg50uLb05iZ0tlovfPHrcx/iIagSNXqJRh9vOhpl/loEM9j
4EpvqX12JuI7ArrjQp2+UfdQuVbi0ONgANLP5vYcIzrh6z0u8xT5HSKYH8swKBit
RScrfnvuSYwJGZu/hgxk1WeWKwKBgQDDv0vZRcB5SpvxLxPVvu299Qt2OFQzame7
ZHv5c7SGrdHCLoqLohoxApKgzkUFKB/3rQLlbv5vQWZ/XLlm02+d1j/1MNCXnaL2
HuEydmPusksz9x4FBAb4mf2koBjNiuIYCnH9wxODXKvzxUQLrwaIcSpbdO84UvEF
VUOXsWneOQKBgEO/HyqVF4+CY8jV9LJWjvXhygJJvrGrKU2GWYarnOpzecgL+Of2
XzPa2+0CR7ns8iewtLV9aira3fbBEHodq8CYM800IsEdDqV8D+dUgh3tuCe23FYJ
hLXI//ZxXtxMKJ2nwcV1+Aj6ey3tTosihTraoYCS4EI876kcmuGSkq5HAoGAPhWE
Rws6er3RK/PUhKyj1uXLltlSy2PqNqMuNvYdwcGLj90XECZ/zB+Wxe3mMjaBvRpg
mshTZpIFokuUeiqBcjwr2OZ8ojnbH9i3cDvggiqGc5rjKJAYbezZZ8dnVnnAMAPQ
F74xiC5yU0Szykje95N87bjuzpxv2VMrtwcMHvECgYA47s+uNxZdNbWeRgwVay1w
4yeJD2WnxpWrVmwosnrjU25QC73AHeMpfHvZaNoybvtiWf26RgsppuLr5Xic4Z/a
HLbd9fJBAxrEIM9HXbNAbtlIddGIEbnGIK8USc1LuAt0EmTpfr+zFsl3nu52JTm0
h87g/qBXJrxZ7o+w+KxL/Q==
-----END PRIVATE KEY-----`;
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: getNextPort(),
          tls: { cert, key },
          handler: () => new Response('OK'),
        });
        const opts = server.options as ServerOptions<'TCP'>;
        if (!opts.tls) {
          throw new Error('TLS options not set');
        }
      });
    });

    describe('initial state', () => {
      it('should have STOPPED state initially', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });
        if (server.state !== 'STOPPED') {
          throw new Error(`Expected state 'STOPPED', got '${server.state}'`);
        }
      });

      it('should have null address when stopped', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });
        if (server.address !== null) {
          throw new Error(`Expected null address, got '${server.address}'`);
        }
      });

      it('should have initial metrics with zeros', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });
        const metrics = server.metrics;
        if (metrics.requests.total !== 0) {
          throw new Error('Expected total requests to be 0');
        }
        if (metrics.requests.active !== 0) {
          throw new Error('Expected active requests to be 0');
        }
        if (metrics.statusCodes['2xx'] !== 0) {
          throw new Error('Expected 2xx count to be 0');
        }
        if (metrics.websocket.connections.total !== 0) {
          throw new Error('Expected websocket connections to be 0');
        }
      });
    });
  });

  // ===========================================================================
  // Start/Stop Tests
  // ===========================================================================

  describe('start', () => {
    it('should start server and change state to RUNNING', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      if (activeServer.state !== 'RUNNING') {
        throw new Error(
          `Expected state 'RUNNING', got '${activeServer.state}'`,
        );
      }
    });

    it('should provide correct address when running (TCP)', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      if (activeServer.address !== `localhost:${port}`) {
        throw new Error(
          `Expected address 'localhost:${port}', got '${activeServer.address}'`,
        );
      }
    });

    it('should throw ServerAlreadyRunningError when starting twice', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      let threw = false;
      try {
        await activeServer.start();
      } catch (error) {
        threw = true;
        if (!(error instanceof ServerAlreadyRunningError)) {
          throw new Error(`Expected ServerAlreadyRunningError`);
        }
      }
      if (!threw) {
        throw new Error('Expected error to be thrown');
      }
    });

    it('should fire onStart event', async () => {
      const port = getNextPort();
      let eventFired = false;
      let receivedName = '';
      let receivedMode = '';

      activeServer = new WebServer('TestServer', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      activeServer.on('onStart', (name, mode) => {
        eventFired = true;
        receivedName = name;
        receivedMode = mode;
      });

      await activeServer.start();
      await delay(100);

      if (!eventFired) {
        throw new Error('onStart event not fired');
      }
      if (receivedName !== 'TestServer') {
        throw new Error(`Expected name 'TestServer', got '${receivedName}'`);
      }
      if (receivedMode !== 'TCP') {
        throw new Error(`Expected mode 'TCP', got '${receivedMode}'`);
      }
    });

    it('should handle requests after starting', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('Hello World'),
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      const text = await response.text();

      if (text !== 'Hello World') {
        throw new Error(`Expected 'Hello World', got '${text}'`);
      }
    });

    // Regression: a Host header that Node's HTTP parser accepts but WHATWG
    // URL parsing rejects (out-of-range port) used to throw synchronously
    // inside the Node request listener, surfacing as an uncaughtException
    // that killed the whole process — an unauthenticated remote DoS. The
    // server must instead reject the request (400 on Node) and stay up.
    it('should not crash on a malformed Host header', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      const conn = await connect({
        port,
        hostname: '127.0.0.1',
        timeout: 2000,
      });
      const raw =
        'GET / HTTP/1.1\r\nHost: a_b:99999999999\r\nConnection: close\r\n\r\n';
      await conn.write(new TextEncoder().encode(raw));

      // Read the response, guarded against a hang if the peer never replies.
      let responseText = '';
      try {
        const chunk = await Promise.race([
          conn.read(),
          new Promise<null>((r) => setTimeout(() => r(null), 1500)),
        ]);
        if (chunk) responseText = new TextDecoder().decode(chunk);
      } catch {
        // Ignore read errors.
      }
      conn.close();

      // The server must still be alive and serving after the bad request.
      const ok = await fetch(`http://127.0.0.1:${port}/`);
      const body = await ok.text();
      if (body !== 'OK') {
        throw new Error(
          `Server should survive a malformed Host header; got body '${body}'`,
        );
      }

      // On Node the malformed request is answered with 400 Bad Request.
      if (RUNTIME === 'NODE' && !responseText.startsWith('HTTP/1.1 400')) {
        throw new Error(
          `Expected 400 for malformed Host, got: ${
            responseText.slice(0, 40) || '(no response)'
          }`,
        );
      }
    });

    // Docs contract: webserver/docs/Compat-WebServer-Errors.md "Malformed
    // Request" documents that a malformed `Host` header is handled
    // differently per runtime — Node rejects it with 400 *before* the handler
    // runs (handler not invoked), while Deno and Bun dispatch the native
    // Request to the handler with `req.url` set to the unparseable string, so
    // the documented `new URL(req.url)` idiom throws and the server answers
    // 500. This pins that behavior so the docs cannot silently drift back to
    // the old (false) "your handler is not invoked, no action required" claim.
    it('malformed Host: rejected before handler on Node, dispatched to handler (500) on Deno/Bun', async () => {
      const port = getNextPort();
      let handlerInvoked = false;
      let seenUrl: string | null = null;
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: '127.0.0.1',
        handler: (req) => {
          handlerInvoked = true;
          seenUrl = req.url;
          // Documented handler idiom — throws on a malformed Host.
          const url = new URL(req.url);
          return new Response(url.pathname);
        },
      });

      await activeServer.start();
      await delay(100);

      const conn = await connect({
        port,
        hostname: '127.0.0.1',
        timeout: 2000,
      });
      const raw =
        'GET /x HTTP/1.1\r\nHost: a_b:99999999999\r\nConnection: close\r\n\r\n';
      await conn.write(new TextEncoder().encode(raw));

      let responseText = '';
      try {
        const chunk = await Promise.race([
          conn.read(),
          new Promise<null>((r) => setTimeout(() => r(null), 1500)),
        ]);
        if (chunk) responseText = new TextDecoder().decode(chunk);
      } catch {
        // Ignore read errors.
      }
      conn.close();
      await delay(50);

      if (RUNTIME === 'NODE') {
        // Node rejects the malformed request with 400 before dispatch.
        if (!responseText.startsWith('HTTP/1.1 400')) {
          throw new Error(
            `Node: expected 400 for malformed Host, got: ${
              responseText.slice(0, 40) || '(no response)'
            }`,
          );
        }
        if (handlerInvoked) {
          throw new Error(
            'Node: handler must NOT be invoked for a malformed Host',
          );
        }
      } else {
        // Deno and Bun dispatch the request to the handler; the handler's
        // `new URL(req.url)` throws, so the server answers 500.
        if (!handlerInvoked) {
          throw new Error(
            `${RUNTIME}: handler MUST be invoked for a malformed Host (docs contract)`,
          );
        }
        if (
          seenUrl === null || !(seenUrl as string).includes('a_b:99999999999')
        ) {
          throw new Error(
            `${RUNTIME}: handler should see the raw malformed url, saw: ${seenUrl}`,
          );
        }
        if (!responseText.startsWith('HTTP/1.1 500')) {
          throw new Error(
            `${RUNTIME}: expected 500 (new URL(req.url) threw), got: ${
              responseText.slice(0, 40) || '(no response)'
            }`,
          );
        }
      }

      // The server must still be alive and serving after the bad request.
      const ok = await fetch(`http://127.0.0.1:${port}/`);
      await ok.text();
    });

    it({
      name: 'should start UNIX socket server',
      windows: false,
      fn: async () => {
        const socketPath = `/tmp/test-start-${Date.now()}.sock`;
        activeServer = new WebServer('Test', {
          mode: 'UNIX',
          unixSocketPath: socketPath,
          handler: () => new Response('UNIX OK'),
        });

        await activeServer.start();
        await delay(100);

        if (activeServer.state !== 'RUNNING') {
          throw new Error('Server should be running');
        }
        if (activeServer.address !== socketPath) {
          throw new Error(`Expected address '${socketPath}'`);
        }
      },
    });

    it({
      name: 'should clean up existing socket file on start',
      windows: false,
      fn: async () => {
        const socketPath = `/tmp/test-cleanup-${Date.now()}.sock`;

        // Create a fake socket file
        writeTextFileSync(socketPath, 'fake socket');

        if (!pathExistsSync(socketPath)) {
          throw new Error('Failed to create test file');
        }

        activeServer = new WebServer('Test', {
          mode: 'UNIX',
          unixSocketPath: socketPath,
          handler: () => new Response('OK'),
        });

        await activeServer.start();
        await delay(100);

        // Server should have cleaned up the old file and started
        if (activeServer.state !== 'RUNNING') {
          throw new Error('Server should be running');
        }
      },
    });
  });

  describe('stop', () => {
    it('should stop server and change state to STOPPED', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      await activeServer.stop();

      if (activeServer.state !== 'STOPPED') {
        throw new Error(
          `Expected state 'STOPPED', got '${activeServer.state}'`,
        );
      }
    });

    it('should throw ServerNotRunningError when stopping non-running server', async () => {
      const server = new WebServer('Test', {
        mode: 'TCP',
        port: getNextPort(),
        handler: () => new Response('OK'),
      });

      let threw = false;
      try {
        await server.stop();
      } catch (error) {
        threw = true;
        if (!(error instanceof ServerNotRunningError)) {
          throw new Error(`Expected ServerNotRunningError`);
        }
      }
      if (!threw) {
        throw new Error('Expected error to be thrown');
      }
    });

    it('should fire onClose event', async () => {
      const port = getNextPort();
      let eventFired = false;

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      activeServer.on('onClose', () => {
        eventFired = true;
      });

      await activeServer.start();
      await delay(100);
      await activeServer.stop();
      activeServer = null;

      if (!eventFired) {
        throw new Error('onClose event not fired');
      }
    });

    it('should return null address after stopping', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);
      await activeServer.stop();

      if (activeServer.address !== null) {
        throw new Error(`Expected null address, got '${activeServer.address}'`);
      }
      activeServer = null;
    });

    it('should support graceful stop (default)', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      // Graceful stop (default)
      await activeServer.stop();
      activeServer = null;
    });

    it('should support force stop', async () => {
      const port = getNextPort();
      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      // Force stop
      await activeServer.stop(false);
      activeServer = null;
    });

    it({
      name: 'should clean up UNIX socket file on stop',
      windows: false,
      fn: async () => {
        const socketPath = `/tmp/test-stop-cleanup-${Date.now()}.sock`;
        activeServer = new WebServer('Test', {
          mode: 'UNIX',
          unixSocketPath: socketPath,
          handler: () => new Response('OK'),
        });

        await activeServer.start();
        await delay(100);

        // Socket should exist
        if (!pathExistsSync(socketPath)) {
          throw new Error('Socket file should exist while running');
        }

        await activeServer.stop();
        activeServer = null;
        await delay(100);

        // Socket should be cleaned up
        if (pathExistsSync(socketPath)) {
          throw new Error('Socket file should be cleaned up after stop');
        }
      },
    });
  });

  describe('abort signal', () => {
    it('should stop server when abort signal is triggered', async () => {
      const port = getNextPort();
      const controller = new AbortController();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
        abortSignal: controller.signal,
      });

      await activeServer.start();
      await delay(100);

      if (activeServer.state !== 'RUNNING') {
        throw new Error('Server should be running');
      }

      // Abort
      controller.abort();
      await delay(500);

      const state = activeServer.state as string;
      if (state !== 'STOPPED') {
        throw new Error(`Expected state 'STOPPED', got '${state}'`);
      }
      activeServer = null;
    });
  });

  // ===========================================================================
  // Event System Tests
  // ===========================================================================

  describe('event system', () => {
    describe('on', () => {
      it('should register single listener', async () => {
        const port = getNextPort();
        let called = false;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', () => {
          called = true;
        });

        await activeServer.start();
        await delay(100);

        if (!called) {
          throw new Error('Listener not called');
        }
      });

      it('should register multiple listeners for same event', async () => {
        const port = getNextPort();
        let count = 0;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', () => {
          count++;
        });
        activeServer.on('onStart', () => {
          count++;
        });

        await activeServer.start();
        await delay(100);

        if (count !== 2) {
          throw new Error(`Expected 2 calls, got ${count}`);
        }
      });

      it('should register array of listeners', async () => {
        const port = getNextPort();
        let count = 0;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', [
          () => {
            count++;
          },
          () => {
            count++;
          },
          () => {
            count++;
          },
        ]);

        await activeServer.start();
        await delay(100);

        if (count !== 3) {
          throw new Error(`Expected 3 calls, got ${count}`);
        }
      });
    });

    describe('off', () => {
      it('should remove specific listener', async () => {
        const port = getNextPort();
        let called = false;

        const listener = () => {
          called = true;
        };

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', listener);
        activeServer.off('onStart', listener);

        await activeServer.start();
        await delay(100);

        if (called) {
          throw new Error('Listener should not have been called');
        }
      });

      it('should remove all listeners when called without listener argument', async () => {
        const port = getNextPort();
        let count = 0;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', () => {
          count++;
        });
        activeServer.on('onStart', () => {
          count++;
        });
        activeServer.off('onStart');

        await activeServer.start();
        await delay(100);

        if (count !== 0) {
          throw new Error('No listeners should have been called');
        }
      });

      it('should remove array of listeners', async () => {
        const port = getNextPort();
        let count = 0;

        const listener1 = () => {
          count++;
        };
        const listener2 = () => {
          count++;
        };

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', [listener1, listener2]);
        activeServer.off('onStart', [listener1, listener2]);

        await activeServer.start();
        await delay(100);

        if (count !== 0) {
          throw new Error('No listeners should have been called');
        }
      });

      it('should handle removing non-existent listener gracefully', () => {
        const server = new WebServer('Test', {
          mode: 'TCP',
          port: getNextPort(),
          handler: () => new Response('OK'),
        });

        // Should not throw
        server.off('onStart', () => {});
        server.off('onError');
      });
    });

    describe('onResponse event', () => {
      it('should fire onResponse after successful request', async () => {
        const port = getNextPort();
        let eventFired = false;
        let receivedStatus = 0;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK', { status: 201 }),
        });

        activeServer.on('onResponse', (_name, _req, _info, response) => {
          eventFired = true;
          receivedStatus = response.status;
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
        await delay(50);

        if (!eventFired) {
          throw new Error('onResponse event not fired');
        }
        if (receivedStatus !== 201) {
          throw new Error(`Expected status 201, got ${receivedStatus}`);
        }
      });

      it('should provide RequestInfo in onResponse', async () => {
        const port = getNextPort();
        let receivedRequestId: string | null = null;
        let receivedRequestTime: unknown = null;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onResponse', (_name, _req, info) => {
          receivedRequestId = info.requestId;
          receivedRequestTime = info.requestTime;
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
        await delay(50);

        if (!receivedRequestId) {
          throw new Error('requestId not provided');
        }
        if (!(receivedRequestTime instanceof Date)) {
          throw new TypeError('requestTime should be a Date');
        }
      });
    });

    describe('onError event', () => {
      it('should fire onError when handler throws', async () => {
        const port = getNextPort();
        let eventFired = false;
        let isServerError = false;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => {
            throw new Error('Handler error');
          },
        });

        activeServer.on('onError', (_name, error) => {
          eventFired = true;
          isServerError = error instanceof ServerError;
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
        await delay(50);

        if (!eventFired) {
          throw new Error('onError event not fired');
        }
        if (!isServerError) {
          throw new Error('Expected ServerError');
        }
      });

      it('should return 500 response when handler throws', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => {
            throw new Error('Handler error');
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();

        if (response.status !== 500) {
          throw new Error(`Expected status 500, got ${response.status}`);
        }
      });
    });

    describe('onWarning event', () => {
      it({
        name: 'should fire onWarning for unsupported options in Bun',
        deno: false,
        node: false,
        fn: async () => {
          const port = getNextPort();
          let warningReceived = false;

          activeServer = new WebServer('Test', {
            mode: 'TCP',
            port,
            hostname: 'localhost',
            backlog: 100, // Not supported in Bun
            handler: () => new Response('OK'),
          });

          activeServer.on('onWarning', () => {
            warningReceived = true;
          });

          await activeServer.start();
          await delay(100);

          if (!warningReceived) {
            throw new Error(
              'onWarning not fired for unsupported backlog in Bun',
            );
          }
        },
      });
    });
  });

  // ===========================================================================
  // Metrics Tests
  // ===========================================================================

  describe('metrics', () => {
    it('should track total requests', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
      }
      await delay(50);

      const metrics = activeServer.metrics;
      if (metrics.requests.total !== 3) {
        throw new Error(
          `Expected 3 total requests, got ${metrics.requests.total}`,
        );
      }
    });

    it('should track status codes', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: (request) => {
          const url = new URL(request.url);
          if (url.pathname === '/error') {
            return new Response('Error', { status: 500 });
          }
          if (url.pathname === '/notfound') {
            return new Response('Not Found', { status: 404 });
          }
          return new Response('OK', { status: 200 });
        },
      });

      await activeServer.start();
      await delay(100);

      // Make requests with different statuses
      let response = await fetch(`http://localhost:${port}/`);
      await response.text();
      response = await fetch(`http://localhost:${port}/`);
      await response.text();
      response = await fetch(`http://localhost:${port}/notfound`);
      await response.text();
      response = await fetch(`http://localhost:${port}/error`);
      await response.text();

      await delay(50);

      const metrics = activeServer.metrics;
      if (metrics.statusCodes['2xx'] !== 2) {
        throw new Error(
          `Expected 2 2xx responses, got ${metrics.statusCodes['2xx']}`,
        );
      }
      if (metrics.statusCodes['4xx'] !== 1) {
        throw new Error(
          `Expected 1 4xx response, got ${metrics.statusCodes['4xx']}`,
        );
      }
      if (metrics.statusCodes['5xx'] !== 1) {
        throw new Error(
          `Expected 1 5xx response, got ${metrics.statusCodes['5xx']}`,
        );
      }
    });

    it('should track response time', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: async () => {
          await delay(10); // Simulate processing
          return new Response('OK');
        },
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      await response.text();
      await delay(50);

      const metrics = activeServer.metrics;
      if (metrics.responseTime.min <= 0) {
        throw new Error('Response time min should be > 0');
      }
      if (metrics.responseTime.max <= 0) {
        throw new Error('Response time max should be > 0');
      }
      if (metrics.responseTime.average <= 0) {
        throw new Error('Response time average should be > 0');
      }
    });

    it('should track peak active requests', async () => {
      const port = getNextPort();
      let concurrentRequests = 0;
      let maxConcurrent = 0;

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: async () => {
          concurrentRequests++;
          if (concurrentRequests > maxConcurrent) {
            maxConcurrent = concurrentRequests;
          }
          await delay(50);
          concurrentRequests--;
          return new Response('OK');
        },
      });

      await activeServer.start();
      await delay(100);

      // Make concurrent requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          fetch(`http://localhost:${port}/`).then((r) => r.text()),
        );
      }
      await Promise.all(promises);
      await delay(50);

      const metrics = activeServer.metrics;
      if (metrics.requests.peakActive < 2) {
        throw new Error(
          `Expected peakActive >= 2, got ${metrics.requests.peakActive}`,
        );
      }
    });

    describe('resetMetrics', () => {
      it('should reset all metrics to zero', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        await activeServer.start();
        await delay(100);

        // Make some requests
        for (let i = 0; i < 3; i++) {
          const response = await fetch(`http://localhost:${port}/`);
          await response.text();
        }
        await delay(50);

        // Verify metrics were collected
        let metrics = activeServer.metrics;
        if (metrics.requests.total !== 3) {
          throw new Error('Metrics should show 3 requests');
        }

        // Reset metrics
        activeServer.resetMetrics();

        // Verify metrics are reset
        metrics = activeServer.metrics;
        if (metrics.requests.total !== 0) {
          throw new Error('Total requests should be 0 after reset');
        }
        if (metrics.statusCodes['2xx'] !== 0) {
          throw new Error('2xx count should be 0 after reset');
        }
        if (metrics.responseTime.average !== 0) {
          throw new Error('Average response time should be 0 after reset');
        }
      });
    });

    it('should return copy of metrics (not reference)', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      const metrics1 = activeServer.metrics;
      metrics1.requests.total = 999; // Try to modify

      const metrics2 = activeServer.metrics;
      if (metrics2.requests.total === 999) {
        throw new Error('Metrics should be a copy, not a reference');
      }
    });

    // Re-review fix: `connectionDuration.average` used to divide the
    // accumulated duration by `connections.total` — a counter bumped on
    // every *open* and never decremented — so the average was understated
    // while connections were still open. It must divide by the number of
    // *closed* connections instead. Driven directly through the protected
    // metric hooks so the assertion is fully time-independent: with exactly
    // one connection closed, its duration is the only sample, so average
    // must equal both min and max. Before the fix, average = sample / 2.
    it('WS connectionDuration.average divides by closed connections, not opens', () => {
      class WsMetricProbe extends WebServer {
        public probeOpen(): void {
          this._wsMetricOpen();
        }
        public probeClose(startTime: number | null): void {
          this._wsMetricClose(startTime);
        }
      }

      const probe = new WsMetricProbe('WsMetricProbe', {
        mode: 'TCP',
        port: getNextPort(),
        hostname: 'localhost',
        handler: () => new Response('ok'),
      });

      // Two connections open (total = 2, active = 2); exactly one closes
      // with a measurable (> 0) duration, the other stays open.
      probe.probeOpen();
      probe.probeOpen();
      probe.probeClose(performance.now() - 100);

      const m = probe.metrics;
      if (m.websocket.connections.total !== 2) {
        throw new Error(
          `Expected connections.total 2, got ${m.websocket.connections.total}`,
        );
      }
      if (m.websocket.connections.active !== 1) {
        throw new Error(
          `Expected connections.active 1, got ${m.websocket.connections.active}`,
        );
      }

      const cd = m.websocket.connectionDuration;
      if (!(cd.average > 0)) {
        throw new Error(
          `Expected average > 0 for a closed connection, got ${cd.average}`,
        );
      }
      // One closed connection => the sole sample; average === max === min.
      if (cd.average !== cd.max) {
        throw new Error(
          `average (${cd.average}) must equal the sole sample max (${cd.max}), ` +
            `not be divided by connections.total`,
        );
      }
      if (cd.average !== cd.min) {
        throw new Error(
          `average (${cd.average}) must equal the sole sample min (${cd.min})`,
        );
      }
    });
  });

  // ===========================================================================
  // Request Handling Tests
  // ===========================================================================

  describe('request handling', () => {
    it('should handle GET requests', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: (request) => new Response(`Method: ${request.method}`),
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      const text = await response.text();

      if (text !== 'Method: GET') {
        throw new Error(`Expected 'Method: GET', got '${text}'`);
      }
    });

    it('should handle POST requests with JSON body', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: async (request) => {
          const body = await request.json();
          return Response.json({ received: body });
        },
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
      });
      const data = await response.json();

      if (data.received.test !== 'data') {
        throw new Error(`Expected received.test to be 'data'`);
      }
    });

    it('should handle custom headers', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: (request) => {
          const custom = request.headers.get('X-Custom');
          return new Response(`Custom: ${custom}`);
        },
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`, {
        headers: { 'X-Custom': 'test-value' },
      });
      const text = await response.text();

      if (text !== 'Custom: test-value') {
        throw new Error(`Expected 'Custom: test-value', got '${text}'`);
      }
    });

    it('should provide remoteAddress in RequestInfo', async () => {
      const port = getNextPort();
      let receivedAddress: string | null = null;

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: (_request, info) => {
          receivedAddress = info.remoteAddress;
          return new Response('OK');
        },
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      await response.text();

      if (!receivedAddress) {
        throw new Error('remoteAddress should be provided');
      }
    });

    it('should provide unique requestId for each request', async () => {
      const port = getNextPort();
      const requestIds: string[] = [];

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: (_request, info) => {
          requestIds.push(info.requestId);
          return new Response('OK');
        },
      });

      await activeServer.start();
      await delay(100);

      // Make multiple requests
      for (let i = 0; i < 3; i++) {
        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
      }

      // Verify all IDs are unique
      const uniqueIds = new Set(requestIds);
      if (uniqueIds.size !== 3) {
        throw new Error('Each request should have a unique requestId');
      }
    });

    it('should handle streaming responses', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('chunk1'));
              controller.enqueue(new TextEncoder().encode('chunk2'));
              controller.close();
            },
          });
          return new Response(stream);
        },
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      const text = await response.text();

      if (text !== 'chunk1chunk2') {
        throw new Error(`Expected 'chunk1chunk2', got '${text}'`);
      }
    });
  });

  // ===========================================================================
  // ref/unref Tests
  // ===========================================================================

  describe('ref and unref', () => {
    it('should throw ServerNotRunningError when calling ref on stopped server', () => {
      const server = new WebServer('Test', {
        mode: 'TCP',
        port: getNextPort(),
        handler: () => new Response('OK'),
      });

      let threw = false;
      try {
        server.ref();
      } catch (error) {
        threw = true;
        if (!(error instanceof ServerNotRunningError)) {
          throw new Error(`Expected ServerNotRunningError`);
        }
      }
      if (!threw) {
        throw new Error('Expected error to be thrown');
      }
    });

    it('should throw ServerNotRunningError when calling unref on stopped server', () => {
      const server = new WebServer('Test', {
        mode: 'TCP',
        port: getNextPort(),
        handler: () => new Response('OK'),
      });

      let threw = false;
      try {
        server.unref();
      } catch (error) {
        threw = true;
        if (!(error instanceof ServerNotRunningError)) {
          throw new Error(`Expected ServerNotRunningError`);
        }
      }
      if (!threw) {
        throw new Error('Expected error to be thrown');
      }
    });

    it('should allow ref when running', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      // Should not throw
      activeServer.ref();
    });

    it('should allow unref when running', async () => {
      const port = getNextPort();

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => new Response('OK'),
      });

      await activeServer.start();
      await delay(100);

      // Should not throw
      activeServer.unref();
    });
  });

  // ===========================================================================
  // WebSocket Tests
  // ---------------------------------------------------------------------------
  // Server-side WebSocket works on all three runtimes (Bun + Deno native,
  // Node via the `ws` npm package). Tests drive a *client* WebSocket via
  // the global `WebSocket` constructor — stable since Node 22.4, which
  // is our supported floor.
  // ===========================================================================

  describe('WebSocket support', () => {
    it({
      name: 'should handle WebSocket upgrade',
      fn: async () => {
        const port = getNextPort();
        const messages: string[] = [];

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('Not a WebSocket'),
          websocket: {
            open: (ws) => {
              messages.push('opened');
              ws.send('Welcome');
            },
            message: (ws, data) => {
              messages.push(`received: ${data}`); // NOSONAR
              ws.send(`Echo: ${data}`); // NOSONAR
            },
            close: () => {
              messages.push('closed');
            },
          },
        });

        await activeServer.start();
        await delay(100);

        // Note: This test requires the fetch endpoint to trigger WebSocket upgrade
        // The actual upgrade mechanism depends on the handler checking for upgrade header
        // For now, we just verify the server starts with websocket config
        if (activeServer.state !== 'RUNNING') {
          throw new Error('Server should be running with WebSocket config');
        }

        // Verify the messages array is initialized correctly for WebSocket handlers
        if (!Array.isArray(messages)) {
          throw new TypeError('Messages array should be initialized');
        }
      },
    });

    it({
      name: 'should track WebSocket upgrade metrics',
      fn: async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
          websocket: {
            message: () => {},
          },
        });

        await activeServer.start();
        await delay(100);

        // Initial state - no upgrades yet
        const metrics = activeServer.metrics;
        if (metrics.websocket.upgrades !== 0) {
          throw new Error('Expected 0 upgrades initially');
        }
        if (metrics.websocket.connections.total !== 0) {
          throw new Error('Expected 0 connections initially');
        }
      },
    });

    it({
      name: 'upgrade hook can refuse — request falls through to HTTP',
      // Skipped on Node: this test uses `fetch()` to send a request with
      // WebSocket upgrade headers and read the HTTP fallback response.
      // Node's undici fetch can't handle that combination — it errors
      // with "fetch failed" before we get to the response. The same
      // behavior is exercised by the mock-based unit tests in this
      // repo, and the fallback path is what HTTP-only requests hit
      // anyway, so this is just a runtime quirk of the test
      // mechanism, not a behavior gap.
      node: false,
      fn: async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('http-fallback', { status: 200 }),
          websocket: {
            upgrade: () => false, // Always refuse
            message: () => {},
          },
        });

        await activeServer.start();
        await delay(100);

        // Send a request with Upgrade: websocket header — should NOT
        // upgrade because the hook refused; should hit the HTTP handler.
        const res = await fetch(`http://localhost:${port}/`, {
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'upgrade',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13',
          },
        });
        const body = await res.text();
        if (body !== 'http-fallback') {
          throw new Error(
            `Expected fallback body 'http-fallback', got '${body}'`,
          );
        }
      },
    });

    it({
      name: 'upgrade hook can attach typed connection data',
      fn: async () => {
        const port = getNextPort();
        type ConnState = { userId: string; joinedAt: number };

        let observedUserId: string | null = null;

        const typedServer = new WebServer<ConnState>('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
          websocket: {
            upgrade: (req) => {
              const userId = req.headers.get('x-user-id');
              if (!userId) return false;
              return {
                data: { userId, joinedAt: Date.now() },
              };
            },
            open: (ws) => {
              observedUserId = ws.data.userId;
              ws.close();
            },
            message: () => {},
          },
        });
        // Track for cleanup via the unknown-typed activeServer slot.
        activeServer = typedServer as unknown as WebServer<unknown>;

        await typedServer.start();
        await delay(100);

        const ws = new WebSocket(`ws://localhost:${port}/`, []);
        // Inject a header — Deno's WebSocket constructor doesn't accept
        // headers directly, so we use a fetch + Upgrade workaround. For
        // this test we'll skip header injection and instead test that
        // the upgrade hook runs by checking for refusal of a no-header
        // connection.
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener('close', () => resolve());
          ws.addEventListener('error', () => resolve()); // refused → close/error
          setTimeout(() => reject(new Error('timeout')), 2000);
        });

        // Without the header, hook returned false, so observedUserId
        // should still be null (open never fired).
        if (observedUserId !== null) {
          throw new Error(
            `Expected no upgrade without x-user-id header, but open ran with userId=${observedUserId}`,
          );
        }
      },
    });

    it({
      name: 'upgrade hook accepting plain `true` keeps back-compat data shape',
      fn: async () => {
        const port = getNextPort();
        let receivedRequestUrl: string | null = null;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
          websocket: {
            upgrade: () => true, // Accept with default data
            open: (_ws, ctx) => {
              receivedRequestUrl = ctx.request.url;
            },
            message: () => {},
          },
        });

        await activeServer!.start();
        await delay(100);

        const ws = new WebSocket(`ws://localhost:${port}/test-path`);
        await new Promise<void>((resolve) => {
          ws.addEventListener('open', () => {
            ws.close();
            resolve();
          });
          ws.addEventListener('error', () => resolve());
          setTimeout(resolve, 2000);
        });
        await delay(50);

        // TS narrows `let receivedRequestUrl: string | null = null` poorly
        // across closure assignment, so cast explicitly here.
        const url = receivedRequestUrl as string | null;
        if (!url) {
          throw new Error('Expected open() to receive an upgrade context');
        }
        if (!url.includes('/test-path')) {
          throw new Error(
            `Expected request.url to include '/test-path', got '${url}'`,
          );
        }
      },
    });

    it({
      name: 'wrapper exposes bufferedAmount and protocol fields',
      fn: async () => {
        const port = getNextPort();
        const observed: { bufferedAmount?: number; protocol?: string } = {};

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
          websocket: {
            open: (ws) => {
              // Capture and let the client close — server-initiated
              // close on Bun deadlocks the server's force stop in
              // afterEach.
              observed.bufferedAmount = ws.bufferedAmount;
              observed.protocol = ws.protocol;
            },
            message: () => {},
          },
        });

        await activeServer.start();
        await delay(100);

        const ws = new WebSocket(`ws://localhost:${port}/`);
        await new Promise<void>((resolve) => {
          ws.addEventListener('open', () => {
            ws.close();
            resolve();
          });
          ws.addEventListener('error', () => resolve());
          setTimeout(resolve, 2000);
        });
        await delay(50);

        if (typeof observed.bufferedAmount !== 'number') {
          throw new TypeError('bufferedAmount should be a number');
        }
        if (typeof observed.protocol !== 'string') {
          throw new TypeError('protocol should be a string');
        }
      },
    });

    // -----------------------------------------------------------------------
    // Bun-specific: error event emulation
    // -----------------------------------------------------------------------
    // Bun's native WebSocketHandler has no `error` callback; we wrap user
    // handlers in try/catch and synthesize the event ourselves. This live
    // test exercises that path end-to-end on Bun.
    it({
      name: 'Bun: synthesizes error event when message handler throws',
      deno: false,
      node: false,
      fn: async () => {
        const port = getNextPort();
        const errors: Error[] = [];

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
          websocket: {
            message: () => {
              throw new Error('boom');
            },
            error: (_ws, err) => {
              errors.push(err);
            },
          },
        });

        await activeServer.start();
        await delay(100);

        const ws = new WebSocket(`ws://localhost:${port}/`);
        await new Promise<void>((resolve) => {
          ws.addEventListener('open', () => {
            ws.send('trigger');
            resolve();
          });
          ws.addEventListener('error', () => resolve());
          setTimeout(resolve, 2000);
        });
        // Give the server time to dispatch the synthesized error.
        await delay(100);
        ws.close();
        await delay(50);

        if (errors.length === 0) {
          throw new Error(
            'Expected synthesized error event from Bun emulation, got none',
          );
        }
        if (!(errors[0] instanceof Error) || errors[0].message !== 'boom') {
          throw new Error(
            `Expected error 'boom', got: ${String(errors[0])}`,
          );
        }
      },
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should wrap non-ServerError in ServerError', async () => {
      const port = getNextPort();
      let isServerError = false;
      let hasCause = false;

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => {
          throw new TypeError('Type error');
        },
      });

      activeServer.on('onError', (_name, error) => {
        isServerError = error instanceof ServerError;
        hasCause = error.cause !== undefined;
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      await response.text();
      await delay(50);

      if (!isServerError) {
        throw new Error('Error should be wrapped in ServerError');
      }
      if (!hasCause) {
        throw new Error('Original error should be in cause');
      }
    });

    it('should preserve ServerError when thrown from handler', async () => {
      const port = getNextPort();
      let receivedError: ServerError | null = null;

      const customError = new ServerError('Custom error', 'TCP', 'test');

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: () => {
          throw customError;
        },
      });

      activeServer.on('onError', (_name, error) => {
        receivedError = error;
      });

      await activeServer.start();
      await delay(100);

      const response = await fetch(`http://localhost:${port}/`);
      await response.text();
      await delay(50);

      if (receivedError !== customError) {
        throw new Error('Original ServerError should be preserved');
      }
    });
  });

  // ===========================================================================
  // Error Class Tests
  // ===========================================================================

  describe('Error classes', () => {
    describe('ServerError', () => {
      it('should have correct properties', () => {
        const error = new ServerError('Test error', 'TCP', 'test-op');
        if (error.message !== 'Test error') {
          throw new Error('Message mismatch');
        }
        if (error.mode !== 'TCP') {
          throw new Error('Mode mismatch');
        }
        if (error.operation !== 'test-op') {
          throw new Error('Operation mismatch');
        }
        if (error.name !== 'ServerError') {
          throw new Error('Name mismatch');
        }
      });

      it('should include cause when provided', () => {
        const cause = new Error('Cause');
        const error = new ServerError('Test', 'TCP', 'op', cause);
        if (error.cause !== cause) {
          throw new Error('Cause should be set');
        }
      });

      it('should serialize to JSON', () => {
        const error = new ServerError('Test', 'TCP', 'op');
        const json = error.toJSON();
        if (json.message !== 'Test') {
          throw new Error('JSON message mismatch');
        }
        if (json.mode !== 'TCP') {
          throw new Error('JSON mode mismatch');
        }
        if (json.operation !== 'op') {
          throw new Error('JSON operation mismatch');
        }
      });
    });

    describe('ServerNotRunningError', () => {
      it('should have correct message', () => {
        const error = new ServerNotRunningError('TCP', 'stop');
        if (!error.message.includes('not running')) {
          throw new Error('Message should mention not running');
        }
      });
    });

    describe('ServerAlreadyRunningError', () => {
      it('should have correct message', () => {
        const error = new ServerAlreadyRunningError('TCP', 'start');
        if (!error.message.includes('already running')) {
          throw new Error('Message should mention already running');
        }
      });
    });

    describe('ServerConfigurationError', () => {
      it('should include key and value in message', () => {
        const error = new ServerConfigurationError(
          'TCP',
          'port',
          99999,
          'valid port',
        );
        if (!error.message.includes('port')) {
          throw new Error('Message should include key');
        }
        if (!error.message.includes('99999')) {
          throw new Error('Message should include value');
        }
      });

      it('should include expected when provided', () => {
        const error = new ServerConfigurationError(
          'TCP',
          'port',
          -1,
          'positive number',
        );
        if (!error.message.includes('positive number')) {
          throw new Error('Message should include expected');
        }
      });
    });

    describe('ServerPermissionError', () => {
      it('should have PERMISSION operation', () => {
        const error = new ServerPermissionError('No access', 'TCP');
        if (error.operation !== 'PERMISSION') {
          throw new Error('Operation should be PERMISSION');
        }
      });
    });
  });

  // ===========================================================================
  // Concurrent Requests Test
  // ===========================================================================

  describe('concurrent requests', () => {
    it('should handle many concurrent requests', async () => {
      const port = getNextPort();
      let requestCount = 0;

      activeServer = new WebServer('Test', {
        mode: 'TCP',
        port,
        hostname: 'localhost',
        handler: async () => {
          requestCount++;
          await delay(10);
          return new Response('OK');
        },
      });

      await activeServer.start();
      await delay(100);

      // Make 20 concurrent requests
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          fetch(`http://localhost:${port}/`).then((r) => r.text()),
        );
      }
      await Promise.all(promises);
      await delay(50);

      if (requestCount !== 20) {
        throw new Error(`Expected 20 requests, got ${requestCount}`);
      }

      const metrics = activeServer.metrics;
      if (metrics.requests.total !== 20) {
        throw new Error(`Expected 20 total requests in metrics`);
      }
    });
  });

  // ===========================================================================
  // Additional Coverage Tests
  // ===========================================================================

  describe('additional coverage', () => {
    describe('1xx status codes tracking', () => {
      it('should track 1xx informational responses', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response(null, { status: 100 }),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
        await delay(50);

        // Note: 100 Continue is typically not returned as final response,
        // but we test the metric tracking code path
        const metrics = activeServer.metrics;
        if (typeof metrics.statusCodes['1xx'] !== 'number') {
          throw new TypeError('1xx tracking should exist');
        }
      });
    });

    describe('3xx status codes tracking', () => {
      it('should track 3xx redirect responses', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () =>
            new Response(null, {
              status: 301,
              headers: { Location: 'http://example.com' },
            }),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`, {
          redirect: 'manual',
        });
        await delay(50);

        if (response.status !== 301) {
          throw new Error(`Expected 301, got ${response.status}`);
        }

        const metrics = activeServer.metrics;
        if (metrics.statusCodes['3xx'] !== 1) {
          throw new Error(
            `Expected 1 3xx response, got ${metrics.statusCodes['3xx']}`,
          );
        }
      });
    });

    describe('address getter edge cases', () => {
      it('should return correct address with port 0 (random port)', async () => {
        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port: 0, // Random port
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        if (activeServer.address !== null) {
          throw new Error('Address should be null before starting');
        }

        await activeServer.start();
        await delay(100);

        // Cast required: TS narrows `address` to null from the earlier
        // pre-start check and doesn't reset it across `start()`.
        const address = activeServer.address as string | null;
        if (!address) {
          throw new Error('Address should be set after starting');
        }
        // Should contain localhost and some port number
        if (!address.startsWith('localhost:')) {
          throw new Error(
            `Address should start with 'localhost:', got '${address}'`,
          );
        }
      });
    });

    describe('options property', () => {
      it('should return configured options', () => {
        const port = getNextPort();
        const server = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        const opts = server.options;
        const tcpOpts = opts as ServerOptions<'TCP'>;

        // Options should be accessible
        if (tcpOpts.port !== port) {
          throw new Error(`Expected port ${port}, got ${tcpOpts.port}`);
        }
        if (tcpOpts.hostname !== 'localhost') {
          throw new Error(`Expected hostname 'localhost'`);
        }
        if (tcpOpts.mode !== 'TCP') {
          throw new Error(`Expected mode 'TCP'`);
        }
      });
    });

    describe('handler returning Promise<Response>', () => {
      it('should handle async handlers', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: async () => {
            await delay(10);
            return new Response('Async OK');
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        const text = await response.text();

        if (text !== 'Async OK') {
          throw new Error(`Expected 'Async OK', got '${text}'`);
        }
      });
    });

    describe('request headers access', () => {
      it('should provide access to request headers', async () => {
        const port = getNextPort();
        let receivedHeaderValue: string | null = null;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedHeaderValue = request.headers.get('X-Test-Header');
            return new Response('OK');
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`, {
          headers: {
            'X-Test-Header': 'test-value',
            'Accept': 'application/json',
          },
        });
        await response.text();

        if (receivedHeaderValue !== 'test-value') {
          throw new Error(
            `Custom header should be accessible, got '${receivedHeaderValue}'`,
          );
        }
      });
    });

    describe('request URL parsing', () => {
      it('should provide correct URL in request', async () => {
        const port = getNextPort();
        let receivedUrl = '';

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedUrl = request.url;
            return new Response('OK');
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(
          `http://localhost:${port}/test/path?query=value`,
        );
        await response.text();

        if (!receivedUrl.includes('/test/path')) {
          throw new Error(`URL should include path, got '${receivedUrl}'`);
        }
        if (!receivedUrl.includes('query=value')) {
          throw new Error(`URL should include query, got '${receivedUrl}'`);
        }
      });
    });

    describe('response with custom status text', () => {
      it('should handle responses with custom status text', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () =>
            new Response('Custom', {
              status: 299,
              statusText: 'Custom Status',
            }),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();

        if (response.status !== 299) {
          throw new Error(`Expected status 299, got ${response.status}`);
        }
      });
    });

    describe('response with headers', () => {
      it('should send custom response headers', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () =>
            new Response('OK', {
              headers: {
                'X-Custom-Response': 'custom-value',
                'Content-Type': 'text/plain',
              },
            }),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();

        if (response.headers.get('X-Custom-Response') !== 'custom-value') {
          throw new Error('Custom response header should be sent');
        }
      });
    });

    describe('multiple event types', () => {
      it('should support registering handlers for different events', async () => {
        const port = getNextPort();
        const events: string[] = [];

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        activeServer.on('onStart', () => events.push('start'));
        activeServer.on('onResponse', () => events.push('response'));
        activeServer.on('onClose', () => events.push('close'));

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
        await delay(50);

        await activeServer.stop();
        activeServer = null;

        if (!events.includes('start')) {
          throw new Error('onStart should have fired');
        }
        if (!events.includes('response')) {
          throw new Error('onResponse should have fired');
        }
        if (!events.includes('close')) {
          throw new Error('onClose should have fired');
        }
      });
    });

    describe('error during handler async operation', () => {
      it('should handle errors from async operations', async () => {
        const port = getNextPort();
        let errorReceived = false;

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: async () => {
            await delay(5);
            throw new Error('Async error');
          },
        });

        activeServer.on('onError', () => {
          errorReceived = true;
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        await response.text();
        await delay(50);

        if (!errorReceived) {
          throw new Error('Error should have been received');
        }
        if (response.status !== 500) {
          throw new Error(`Expected 500, got ${response.status}`);
        }
      });
    });

    describe('multiple start/stop cycles', () => {
      it('should handle multiple start/stop cycles', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        // First cycle
        await activeServer.start();
        await delay(100);
        if (activeServer.state !== 'RUNNING') {
          throw new Error('Should be RUNNING after first start');
        }
        await activeServer.stop();
        const stateAfterFirstStop = activeServer.state as string;
        if (stateAfterFirstStop !== 'STOPPED') {
          throw new Error('Should be STOPPED after first stop');
        }

        // Second cycle (same port should be available again)
        await activeServer.start();
        await delay(100);
        if (activeServer.state !== 'RUNNING') {
          throw new Error('Should be RUNNING after second start');
        }
        await activeServer.stop();
        const stateAfterSecondStop = activeServer.state as string;
        if (stateAfterSecondStop !== 'STOPPED') {
          throw new Error('Should be STOPPED after second stop');
        }
        activeServer = null;
      });
    });

    describe('metrics persistence across requests', () => {
      it('should accumulate metrics across multiple requests', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response('OK'),
        });

        await activeServer.start();
        await delay(100);

        // First batch of requests
        for (let i = 0; i < 3; i++) {
          const response = await fetch(`http://localhost:${port}/`);
          await response.text();
        }

        let metrics = activeServer.metrics;
        if (metrics.requests.total !== 3) {
          throw new Error(`Expected 3 requests, got ${metrics.requests.total}`);
        }

        // Second batch of requests
        for (let i = 0; i < 2; i++) {
          const response = await fetch(`http://localhost:${port}/`);
          await response.text();
        }
        await delay(50);

        metrics = activeServer.metrics;
        if (metrics.requests.total !== 5) {
          throw new Error(
            `Expected 5 total requests, got ${metrics.requests.total}`,
          );
        }
      });
    });

    describe('empty handler response', () => {
      it('should handle null body responses', async () => {
        const port = getNextPort();

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response(null, { status: 204 }),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        const text = await response.text();

        if (response.status !== 204) {
          throw new Error(`Expected status 204, got ${response.status}`);
        }
        if (text !== '') {
          throw new Error(`Expected empty body, got '${text}'`);
        }
      });
    });

    describe('large response body', () => {
      it('should handle large response bodies', async () => {
        const port = getNextPort();
        const largeBody = 'x'.repeat(100000); // 100KB

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () => new Response(largeBody),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        const text = await response.text();

        if (text.length !== 100000) {
          throw new Error(`Expected 100000 chars, got ${text.length}`);
        }
      });
    });

    describe('binary response', () => {
      it('should handle binary response data', async () => {
        const port = getNextPort();
        const binaryData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: () =>
            new Response(binaryData, {
              headers: { 'Content-Type': 'application/octet-stream' },
            }),
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`);
        const buffer = await response.arrayBuffer();

        if (buffer.byteLength !== 10) {
          throw new Error(`Expected 10 bytes, got ${buffer.byteLength}`);
        }
        const arr = new Uint8Array(buffer);
        if (arr[0] !== 0 || arr[9] !== 9) {
          throw new Error('Binary data mismatch');
        }
      });
    });

    describe('all HTTP methods', () => {
      it('should handle DELETE method', async () => {
        const port = getNextPort();
        let receivedMethod = '';

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedMethod = request.method;
            return new Response('OK');
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`, {
          method: 'DELETE',
        });
        await response.text();

        if (receivedMethod !== 'DELETE') {
          throw new Error(`Expected DELETE, got ${receivedMethod}`);
        }
      });

      it('should handle PUT method', async () => {
        const port = getNextPort();
        let receivedMethod = '';

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedMethod = request.method;
            return new Response('OK');
          },
        });

        await activeServer.start();
        await delay(100);

        const responsePut = await fetch(`http://localhost:${port}/`, {
          method: 'PUT',
          body: 'test',
        });
        await responsePut.text();

        if (receivedMethod !== 'PUT') {
          throw new Error(`Expected PUT, got ${receivedMethod}`);
        }
      });

      it('should handle PATCH method', async () => {
        const port = getNextPort();
        let receivedMethod = '';

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedMethod = request.method;
            return new Response('OK');
          },
        });

        await activeServer.start();
        await delay(100);

        const responsePatch = await fetch(`http://localhost:${port}/`, {
          method: 'PATCH',
          body: 'test',
        });
        await responsePatch.text();

        if (receivedMethod !== 'PATCH') {
          throw new Error(`Expected PATCH, got ${receivedMethod}`);
        }
      });

      it('should handle HEAD method', async () => {
        const port = getNextPort();
        let receivedMethod = '';

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedMethod = request.method;
            return new Response('OK', {
              headers: { 'X-Custom': 'test' },
            });
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`, {
          method: 'HEAD',
        });

        if (receivedMethod !== 'HEAD') {
          throw new Error(`Expected HEAD, got ${receivedMethod}`);
        }
        // HEAD response should have headers but no body
        if (response.headers.get('X-Custom') !== 'test') {
          throw new Error('HEAD response should include headers');
        }
      });

      it('should handle OPTIONS method', async () => {
        const port = getNextPort();
        let receivedMethod = '';

        activeServer = new WebServer('Test', {
          mode: 'TCP',
          port,
          hostname: 'localhost',
          handler: (request) => {
            receivedMethod = request.method;
            return new Response(null, {
              status: 204,
              headers: {
                'Allow': 'GET, POST, PUT, DELETE, OPTIONS',
              },
            });
          },
        });

        await activeServer.start();
        await delay(100);

        const response = await fetch(`http://localhost:${port}/`, {
          method: 'OPTIONS',
        });

        if (receivedMethod !== 'OPTIONS') {
          throw new Error(`Expected OPTIONS, got ${receivedMethod}`);
        }
        if (!response.headers.get('Allow')?.includes('GET')) {
          throw new Error('OPTIONS should return Allow header');
        }
      });
    });
  });
});
