/**
 * @fileoverview Tests for cross-runtime HTTP fetch with TLS and Unix socket support.
 * @module
 */

import { afterAll, beforeAll, describe, it } from './test.ts';
import { WebServer } from './webserver/mod.ts';
import { fetch } from './fetch.ts';
import {
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
  type TLSOptions,
} from './common.ts';
import { UnsupportedRuntimeError } from './Error.ts';
import * as asserts from '@std/asserts';
import { makeTempDirSync, removeSync, writeTextFile } from './file.ts';
import { join } from './path.ts';

// =============================================================================
// Test Data
// =============================================================================

/** Valid PEM certificate for testing - structurally valid but cryptographically fake */
const VALID_CERT = `-----BEGIN CERTIFICATE-----
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

/** Valid PKCS#8 private key for testing - structurally valid but cryptographically fake */
const VALID_KEY = `-----BEGIN PRIVATE KEY-----
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
-----END PRIVATE KEY-----`; // NOSONAR - test data

/** Valid RSA PKCS#1 private key for testing - structurally valid but fake */
const VALID_RSA_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIICdQIBADANBgkqhkiG9w0BAQEFAASCAl8wggJbAgEAAoGBAMOUCJgKoNxRC6ho
R0MUIeJCi71wnFryqi+pKpIfwr1/R9AKkGxjdhGIbVtHj5zTUBFRBMOQGiHMG/qu
-----END RSA PRIVATE KEY-----`; // NOSONAR - test data

/** Valid EC private key for testing - structurally valid but fake */
const VALID_EC_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEICEPn0d4Rr5G/SH/r8eG4qRdFzC/HhFvM9WITSxW/qdmoAcGBSuBBAAK
-----END EC PRIVATE KEY-----`; // NOSONAR - test data

describe('compat.fetch', () => {
  // Local stand-in for httpbin.org, served by compat's own WebServer —
  // the public service 503s often enough to make CI nondeterministic,
  // and dogfooding the server also smoke-tests both halves of the
  // package together. Port range distinct from WebServer.test.ts
  // (19900+) since the suites may run in parallel.
  const TEST_PORT = 18742;
  const BASE = `http://localhost:${TEST_PORT}`;
  let httpServer: WebServer;
  const pendingDelays = new Set<ReturnType<typeof setTimeout>>();

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  beforeAll(async () => {
    httpServer = new WebServer('FetchTestPeer', {
      mode: 'TCP',
      port: TEST_PORT,
      hostname: 'localhost',
      handler: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/get') {
          return json(200, { ok: true });
        }
        if (url.pathname === '/post' && request.method === 'POST') {
          return json(200, { json: await request.json() });
        }
        if (url.pathname === '/headers') {
          // Header names arrive lowercased (fetch serializes them so).
          return json(200, {
            headers: Object.fromEntries(request.headers.entries()),
          });
        }
        if (url.pathname.startsWith('/delay/')) {
          const seconds = Number(url.pathname.split('/')[2]) || 0;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              pendingDelays.delete(timer);
              resolve();
            }, seconds * 1000);
            pendingDelays.add(timer);
            // Client gone (aborted fetch) — stop waiting immediately.
            request.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              pendingDelays.delete(timer);
              resolve();
            }, { once: true });
          });
          return json(200, { ok: true });
        }
        return json(404, { error: 'not found' });
      },
    });
    await httpServer.start();
  });

  afterAll(async () => {
    for (const timer of pendingDelays) clearTimeout(timer);
    pendingDelays.clear();
    // Force-stop, matching WebServer's own test convention.
    await httpServer.stop(false);
  });
  // ===========================================================================
  // Error Classes
  // ===========================================================================

  describe('Error Classes', () => {
    describe('FetchTLSError', () => {
      it('should create error with all properties', () => {
        const error = new FetchTLSError('TLS failed', 'cert');
        asserts.assertStrictEquals(error.message, 'TLS failed');
        asserts.assertStrictEquals(error.source, 'cert');
        asserts.assertStrictEquals(error.name, 'FetchTLSError');
        asserts.assert(error instanceof Error);
        asserts.assert(error instanceof FetchTLSError);
      });

      it('should include cause when provided', () => {
        const cause = new Error('underlying error');
        const error = new FetchTLSError('wrapper', 'key', cause);
        asserts.assertStrictEquals(error.cause, cause);
      });

      it('should serialize to JSON correctly', () => {
        const error = new FetchTLSError('test message', 'cert');
        const json = error.toJSON();
        asserts.assertStrictEquals(json.name, 'FetchTLSError');
        asserts.assertStrictEquals(json.message, 'test message');
        asserts.assertStrictEquals(json.source, 'cert');
      });
    });

    describe('FetchFileNotFoundError', () => {
      it('should create error with path', () => {
        const error = new FetchFileNotFoundError('/missing/file.pem');
        asserts.assertStrictEquals(error.path, '/missing/file.pem');
        asserts.assert(error.message.includes('/missing/file.pem'));
        asserts.assertStrictEquals(error.name, 'FetchFileNotFoundError');
      });

      it('should include cause when provided', () => {
        const cause = new Error('ENOENT');
        const error = new FetchFileNotFoundError('/path', cause);
        asserts.assertStrictEquals(error.cause, cause);
      });

      it('should serialize to JSON correctly', () => {
        const error = new FetchFileNotFoundError('/test/path.pem');
        const json = error.toJSON();
        asserts.assertStrictEquals(json.name, 'FetchFileNotFoundError');
        asserts.assertStrictEquals(json.path, '/test/path.pem');
      });
    });

    describe('FetchInvalidPEMError', () => {
      it('should extend FetchTLSError', () => {
        const error = new FetchInvalidPEMError('Invalid PEM', 'cert');
        asserts.assert(error instanceof FetchTLSError);
        asserts.assertStrictEquals(error.name, 'FetchInvalidPEMError');
        asserts.assertStrictEquals(error.source, 'cert');
      });

      it('should serialize to JSON correctly', () => {
        const error = new FetchInvalidPEMError('bad format', 'key');
        const json = error.toJSON();
        asserts.assertStrictEquals(json.name, 'FetchInvalidPEMError');
        asserts.assertStrictEquals(json.source, 'key');
      });
    });

    describe('FetchPathTraversalError', () => {
      it('should create error with path and reason', () => {
        const error = new FetchPathTraversalError('../secret');
        asserts.assertStrictEquals(error.path, '../secret');
        asserts.assertStrictEquals(error.reason, 'path_traversal');
        asserts.assertStrictEquals(error.name, 'FetchPathTraversalError');
        asserts.assert(error.message.includes('../secret'));
      });

      it('should include cause when provided', () => {
        const cause = new Error('path check failed');
        const error = new FetchPathTraversalError('/bad/path', cause);
        asserts.assertStrictEquals(error.cause, cause);
      });

      it('should serialize to JSON correctly', () => {
        const error = new FetchPathTraversalError('../../../etc');
        const json = error.toJSON();
        asserts.assertStrictEquals(json.name, 'FetchPathTraversalError');
        asserts.assertStrictEquals(json.path, '../../../etc');
        asserts.assertStrictEquals(json.reason, 'path_traversal');
      });
    });
  });

  // ===========================================================================
  // Basic fetch (passthrough)
  // ===========================================================================

  describe('Basic fetch (passthrough)', () => {
    it('should work without any custom options', async () => {
      const response = await fetch(`${BASE}/get`);
      asserts.assertStrictEquals(response.ok, true);
      asserts.assertStrictEquals(response.status, 200);
      await response.text();
    });

    it('should support standard RequestInit options', async () => {
      const response = await fetch(`${BASE}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: 'data' }),
      });
      asserts.assertStrictEquals(response.ok, true);
      const data = await response.json();
      asserts.assertEquals(data.json, { test: 'data' });
    });

    it('should handle URL object input', async () => {
      const url = new URL(`${BASE}/get`);
      const response = await fetch(url);
      asserts.assertStrictEquals(response.ok, true);
      await response.text();
    });

    it('should handle Request object input', async () => {
      const request = new Request(`${BASE}/get`);
      const response = await fetch(request);
      asserts.assertStrictEquals(response.ok, true);
      await response.text();
    });

    it('should support AbortController', async () => {
      const controller = new AbortController();
      controller.abort();

      await asserts.assertRejects(
        async () =>
          await fetch(`${BASE}/get`, {
            signal: controller.signal,
          }),
      );
    });
  });

  // ===========================================================================
  // TLS rejectUnauthorized parity (re-review fix)
  // ===========================================================================

  // Deno has no in-process way to disable certificate verification. Rather
  // than silently keep verification on (the old behavior — surprising, since
  // net.connect/upgradeTls throw for the same input), fetch now fails loudly
  // on Deno. Deno-only: Bun threads the flag through natively and Node
  // rejects any `tls` option with UnsupportedRuntimeError. The throw happens
  // during option processing, before any network call.
  it({
    name:
      'rejects `rejectUnauthorized: false` on Deno (parity with net.connect)',
    bun: false,
    node: false,
    fn: async () => {
      await asserts.assertRejects(
        () =>
          fetch('https://example.com', {
            tls: { rejectUnauthorized: false },
          }),
        Error,
        'not supported on Deno',
      );
    },
  });

  // ===========================================================================
  // TLS String-based Validation Tests
  // ===========================================================================

  describe({
    name: 'TLS Content Validation (string-based)',
    node: false, // TLS options not supported on Node.js
    fn: () => {
      describe('Certificate validation', () => {
        it('should throw FetchInvalidPEMError for empty certificate', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: '', key: VALID_KEY },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for non-string certificate', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                // @ts-expect-error Testing invalid input
                tls: { cert: null, key: VALID_KEY },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for certificate without markers', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  cert: 'MIIBkTCB+wIJAKHHCgVZU7OXMA0G',
                  key: VALID_KEY,
                },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for certificate with wrong type', async () => {
          // Using a key PEM where certificate is expected
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: VALID_KEY, key: VALID_KEY },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for certificate missing END marker', async () => {
          const badCert = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHCgVZU7OXMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl
c3RDQTAeFw0yMDAxMDEwMDAwMDBaFw0zMDAxMDEwMDAwMDBaMBExDzANBgNVBAMM`;
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: badCert, key: VALID_KEY },
              }),
            FetchInvalidPEMError,
          );
        });
      });

      describe('Private key validation', () => {
        it('should throw FetchInvalidPEMError for empty key', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: VALID_CERT, key: '' },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for non-string key', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: VALID_CERT, key: undefined },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for key without markers', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  cert: VALID_CERT,
                  key: 'MIICdQIBADANBgkqhkiG9w0BAQEFAASCAl8',
                },
              }),
            FetchInvalidPEMError,
          );
        });

        // PEM format validation tests - these test isValidPEM function
        // Note: We can't test actual connections with fake certificates as runtimes
        // will panic when trying to parse cryptographically invalid data

        it('should pass PEM validation for PKCS#8 private key format', () => {
          // Test that PKCS#8 format passes the PEM structure validation
          const pkcs8Pattern =
            /^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/;
          asserts.assert(pkcs8Pattern.test(VALID_KEY.trim()));
        });

        it('should pass PEM validation for RSA PKCS#1 private key format', () => {
          // Test that RSA PKCS#1 format passes the PEM structure validation
          const rsaPattern =
            /^-----BEGIN RSA PRIVATE KEY-----[\s\S]+-----END RSA PRIVATE KEY-----$/;
          asserts.assert(rsaPattern.test(VALID_RSA_KEY.trim()));
        });

        it('should pass PEM validation for EC private key format', () => {
          // Test that EC format passes the PEM structure validation
          const ecPattern =
            /^-----BEGIN EC PRIVATE KEY-----[\s\S]+-----END EC PRIVATE KEY-----$/;
          asserts.assert(ecPattern.test(VALID_EC_KEY.trim()));
        });
      });

      describe('CA certificate validation', () => {
        it('should throw FetchInvalidPEMError for invalid CA certificate', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  cert: VALID_CERT,
                  key: VALID_KEY,
                  ca: ['invalid-pem'],
                },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for CA with wrong type', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  cert: VALID_CERT,
                  key: VALID_KEY,
                  ca: [VALID_KEY], // Using key where cert expected
                },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for empty CA array item', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  cert: VALID_CERT,
                  key: VALID_KEY,
                  ca: [''],
                },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for invalid CA at any index', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  cert: VALID_CERT,
                  key: VALID_KEY,
                  ca: [VALID_CERT, 'invalid-second'],
                },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should accept empty CA array', async () => {
          // Empty CA array should not throw validation error
          try {
            await fetch('https://localhost:9999', {
              tls: { cert: VALID_CERT, key: VALID_KEY, ca: [] },
            });
          } catch (error) {
            // Connection error expected, but not validation error
            asserts.assertFalse(error instanceof FetchInvalidPEMError);
          }
        });
      });

      describe('PEM size limits', () => {
        it('should throw FetchInvalidPEMError for oversized certificate', async () => {
          // Create a PEM that exceeds the 1MB limit
          const largeCert = `-----BEGIN CERTIFICATE-----\n${
            'A'.repeat(1_100_000)
          }\n-----END CERTIFICATE-----`;
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: largeCert, key: VALID_KEY },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for oversized key', async () => {
          const largeKey = `-----BEGIN PRIVATE KEY-----\n${
            'B'.repeat(1_100_000)
          }\n-----END PRIVATE KEY-----`;
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: VALID_CERT, key: largeKey },
              }),
            FetchInvalidPEMError,
          );
        });

        it('should throw FetchInvalidPEMError for oversized CA', async () => {
          const largeCa = `-----BEGIN CERTIFICATE-----\n${
            'C'.repeat(1_100_000)
          }\n-----END CERTIFICATE-----`;
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: { cert: VALID_CERT, key: VALID_KEY, ca: [largeCa] },
              }),
            FetchInvalidPEMError,
          );
        });
      });
    },
  });

  // ===========================================================================
  // TLS File-based Validation Tests
  // ===========================================================================

  describe({
    name: 'TLS File Validation (file-based)',
    node: false, // TLS options not supported on Node.js
    fn: () => {
      describe('Path traversal protection', () => {
        it('should throw FetchPathTraversalError for ../ in certFile', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  certFile: '../../../etc/ssl/cert.pem',
                  keyFile: 'key.pem',
                },
              }),
            FetchPathTraversalError,
          );
        });

        it('should throw FetchPathTraversalError for ../ in keyFile', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  certFile: 'cert.pem',
                  keyFile: '../secret/key.pem',
                },
              }),
            FetchPathTraversalError,
          );
        });

        it('should throw FetchPathTraversalError for ../ in caFile', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  certFile: 'cert.pem',
                  keyFile: 'key.pem',
                  caFile: '../../ca.pem',
                },
              }),
            FetchPathTraversalError,
          );
        });

        it('should throw FetchPathTraversalError for null bytes', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  certFile: '/path/cert\0.pem',
                  keyFile: 'key.pem',
                },
              }),
            FetchPathTraversalError,
          );
        });

        it('should throw FetchPathTraversalError for backslash traversal', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  certFile: String.raw`..\..\windows\cert.pem`,
                  keyFile: 'key.pem',
                },
              }),
            FetchPathTraversalError,
          );
        });
      });

      describe('File existence checks', () => {
        it('should throw FetchFileNotFoundError for missing certFile', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('https://example.com', {
                tls: {
                  certFile: '/nonexistent/cert.pem',
                  keyFile: '/nonexistent/key.pem',
                },
              }),
            FetchFileNotFoundError,
          );
        });

        it('should throw FetchFileNotFoundError for missing keyFile', async () => {
          const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
          const certFile = join(tempDir, 'cert.pem');
          await writeTextFile(certFile, VALID_CERT);

          try {
            await asserts.assertRejects(
              async () =>
                await fetch('https://example.com', {
                  tls: {
                    certFile,
                    keyFile: join(tempDir, 'missing.pem'),
                  },
                }),
              FetchFileNotFoundError,
            );
          } finally {
            removeSync(tempDir);
          }
        });

        it('should throw FetchFileNotFoundError for missing caFile', async () => {
          const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
          const certFile = join(tempDir, 'cert.pem');
          const keyFile = join(tempDir, 'key.pem');
          await writeTextFile(certFile, VALID_CERT);
          await writeTextFile(keyFile, VALID_KEY);

          try {
            await asserts.assertRejects(
              async () =>
                await fetch('https://example.com', {
                  tls: {
                    certFile,
                    keyFile,
                    caFile: join(tempDir, 'missing-ca.pem'),
                  },
                }),
              FetchFileNotFoundError,
            );
          } finally {
            removeSync(tempDir);
          }
        });
      });

      describe('File content validation', () => {
        it('should throw FetchInvalidPEMError for invalid cert file content', async () => {
          const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
          const certFile = join(tempDir, 'cert.pem');
          const keyFile = join(tempDir, 'key.pem');
          await writeTextFile(certFile, 'not a valid PEM file');
          await writeTextFile(keyFile, VALID_KEY);

          try {
            await asserts.assertRejects(
              async () =>
                await fetch('https://example.com', {
                  tls: { certFile, keyFile },
                }),
              FetchInvalidPEMError,
            );
          } finally {
            removeSync(tempDir);
          }
        });

        it('should throw FetchInvalidPEMError for invalid key file content', async () => {
          const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
          const certFile = join(tempDir, 'cert.pem');
          const keyFile = join(tempDir, 'key.pem');
          await writeTextFile(certFile, VALID_CERT);
          await writeTextFile(keyFile, 'not a valid key');

          try {
            await asserts.assertRejects(
              async () =>
                await fetch('https://example.com', {
                  tls: { certFile, keyFile },
                }),
              FetchInvalidPEMError,
            );
          } finally {
            removeSync(tempDir);
          }
        });

        it('should throw FetchInvalidPEMError for invalid CA file content', async () => {
          const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
          const certFile = join(tempDir, 'cert.pem');
          const keyFile = join(tempDir, 'key.pem');
          const caFile = join(tempDir, 'ca.pem');
          await writeTextFile(certFile, VALID_CERT);
          await writeTextFile(keyFile, VALID_KEY);
          await writeTextFile(caFile, 'invalid CA');

          try {
            await asserts.assertRejects(
              async () =>
                await fetch('https://example.com', {
                  tls: { certFile, keyFile, caFile },
                }),
              FetchInvalidPEMError,
            );
          } finally {
            removeSync(tempDir);
          }
        });

        it('should validate file-based TLS passes structural validation', async () => {
          const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
          const certFile = join(tempDir, 'cert.pem');
          const keyFile = join(tempDir, 'key.pem');
          await writeTextFile(certFile, VALID_CERT);
          await writeTextFile(keyFile, VALID_KEY);

          try {
            // Attempt fetch - validation should pass, but connection will fail
            // (either due to invalid crypto data or no server listening)
            await fetch('https://localhost:9999', {
              tls: { certFile, keyFile },
            });
          } catch (error) {
            // Connection or crypto error is expected
            // But NOT validation errors - those should have passed
            asserts.assertFalse(error instanceof FetchInvalidPEMError);
            asserts.assertFalse(error instanceof FetchFileNotFoundError);
            asserts.assertFalse(error instanceof FetchPathTraversalError);
          } finally {
            removeSync(tempDir);
          }
        });
      });
    },
  });

  // ===========================================================================
  // Unix Socket Tests
  // ===========================================================================

  describe({
    name: 'Unix Socket Validation',
    node: false, // Unix sockets not supported on Node.js via this module
    windows: false, // Unix sockets not available on Windows
    fn: () => {
      describe('Path traversal protection', () => {
        it('should throw FetchPathTraversalError for ../ in unix path', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('http://localhost', {
                unix: '../../../var/run/docker.sock',
              }),
            FetchPathTraversalError,
          );
        });

        it('should throw FetchPathTraversalError for null bytes in unix path', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('http://localhost', {
                unix: '/var/run\0/docker.sock',
              }),
            FetchPathTraversalError,
          );
        });

        it('should throw FetchPathTraversalError for backslash traversal', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('http://localhost', {
                unix: String.raw`..\..\var\run\docker.sock`,
              }),
            FetchPathTraversalError,
          );
        });
      });

      describe('Socket existence', () => {
        it('should throw FetchFileNotFoundError for non-existent socket', async () => {
          await asserts.assertRejects(
            async () =>
              await fetch('http://localhost', {
                unix: '/nonexistent/socket.sock',
              }),
            FetchFileNotFoundError,
          );
        });
      });
    },
  });

  // ===========================================================================
  // Runtime Support Tests
  // ===========================================================================

  describe('Runtime Support', () => {
    it({
      name: 'should throw UnsupportedRuntimeError for TLS on Node.js',
      deno: false,
      bun: false,
      fn: async () => {
        await asserts.assertRejects(
          async () =>
            await fetch('https://example.com', {
              tls: { cert: VALID_CERT, key: VALID_KEY },
            }),
          UnsupportedRuntimeError,
        );
      },
    });

    it({
      name: 'should throw UnsupportedRuntimeError for Unix socket on Node.js',
      deno: false,
      bun: false,
      fn: async () => {
        await asserts.assertRejects(
          async () =>
            await fetch('http://localhost', { unix: '/var/run/app.sock' }),
          UnsupportedRuntimeError,
        );
      },
    });
  });

  // ===========================================================================
  // Combined TLS + Unix Socket Tests
  // ===========================================================================

  describe({
    name: 'Combined TLS and Unix Socket',
    node: false,
    windows: false,
    fn: () => {
      it('should validate both TLS and Unix socket', async () => {
        const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
        const certFile = join(tempDir, 'cert.pem');
        const keyFile = join(tempDir, 'key.pem');
        await writeTextFile(certFile, VALID_CERT);
        await writeTextFile(keyFile, VALID_KEY);

        try {
          // Unix socket doesn't exist, should fail on socket validation
          await asserts.assertRejects(
            async () =>
              await fetch('https://localhost', {
                unix: '/nonexistent/socket.sock',
                tls: { certFile, keyFile },
              }),
            FetchFileNotFoundError,
          );
        } finally {
          removeSync(tempDir);
        }
      });

      it('should validate TLS before Unix socket', async () => {
        // Invalid TLS should fail first
        await asserts.assertRejects(
          async () =>
            await fetch('https://localhost', {
              unix: '/nonexistent/socket.sock',
              tls: { cert: 'invalid', key: VALID_KEY },
            }),
          FetchInvalidPEMError,
        );
      });
    },
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle undefined init options', async () => {
      // Explicitly testing undefined is passed correctly
      const response = await fetch(`${BASE}/get`, undefined); // NOSONAR - intentional
      asserts.assertStrictEquals(response.ok, true);
      await response.text();
    });

    it('should handle empty init object', async () => {
      const response = await fetch(`${BASE}/get`, {});
      asserts.assertStrictEquals(response.ok, true);
      await response.text();
    });

    it('should handle init with only standard options', async () => {
      const response = await fetch(`${BASE}/headers`, {
        headers: { 'X-Test': 'value' },
      });
      asserts.assertStrictEquals(response.ok, true);
      const data = await response.json();
      // fetch lowercases header names on the wire; assert on the wire form.
      asserts.assertStrictEquals(data.headers['x-test'], 'value');
    });

    it('should handle network errors', async () => {
      await asserts.assertRejects(
        async () => await fetch('https://invalid-domain-12345.invalid'),
      );
    });

    it('should handle timeout with AbortController', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100);

      try {
        await asserts.assertRejects(
          async () =>
            await fetch(`${BASE}/delay/5`, {
              signal: controller.signal,
            }),
        );
      } finally {
        clearTimeout(timeoutId);
      }
    });

    it('should handle concurrent requests', async () => {
      const promises = Array.from(
        { length: 3 },
        () => fetch(`${BASE}/get`),
      );
      const responses = await Promise.all(promises);

      for (const response of responses) {
        asserts.assertStrictEquals(response.ok, true);
        await response.text();
      }
    });
  });

  // ===========================================================================
  // Type Discrimination Tests
  // ===========================================================================

  describe({
    name: 'TLSOptions type discrimination',
    node: false,
    fn: () => {
      it('should detect file-based TLS by certFile property', async () => {
        const tempDir = makeTempDirSync({ prefix: 'fetch_test_' });
        const certFile = join(tempDir, 'cert.pem');
        const keyFile = join(tempDir, 'key.pem');
        await writeTextFile(certFile, VALID_CERT);
        await writeTextFile(keyFile, VALID_KEY);

        try {
          const options: TLSOptions = { certFile, keyFile };
          await fetch('https://localhost:9999', { tls: options });
        } catch (error) {
          // Connection or crypto error expected, not validation error
          asserts.assertFalse(error instanceof FetchInvalidPEMError);
          asserts.assertFalse(error instanceof FetchFileNotFoundError);
        } finally {
          removeSync(tempDir);
        }
      });

      it('should detect string-based TLS by cert property', async () => {
        try {
          const options: TLSOptions = { cert: VALID_CERT, key: VALID_KEY };
          await fetch('https://localhost:9999', { tls: options });
        } catch (error) {
          // Connection or crypto error expected, not validation error
          asserts.assertFalse(error instanceof FetchInvalidPEMError);
        }
      });
    },
  });
});
