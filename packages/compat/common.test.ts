/**
 * @fileoverview Tests for common utilities and types shared across compat modules.
 * @module
 */

import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import {
  combineSignals,
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
  validateTLS,
  validateTLSContent,
  validateTLSFiles,
  validateUnixSocket,
} from './common.ts';
import { makeTempDirSync, removeSync, writeTextFileSync } from './file.ts';
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

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Deterministically waits for an `AbortSignal` to abort instead of racing a
 * fixed sleep against it. Resolves as soon as the signal aborts (immediately
 * if it is already aborted); rejects if it has not aborted within `timeoutMs`,
 * so a genuinely stuck signal fails the test instead of passing by luck.
 */
function waitForAbort(signal: AbortSignal, timeoutMs = 2000): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Signal did not abort within ${timeoutMs}ms`)),
      timeoutMs,
    );
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

// =============================================================================
// Test Suites
// =============================================================================

describe('compat.common', () => {
  // ===========================================================================
  // FetchTLSError
  // ===========================================================================

  describe('FetchTLSError', () => {
    it('should create error with message and source', () => {
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

    it('should serialize with ca[0] source', () => {
      const error = new FetchTLSError('bad CA', 'ca[0]');
      asserts.assertStrictEquals(error.source, 'ca[0]');
      const json = error.toJSON();
      asserts.assertStrictEquals(json.source, 'ca[0]');
    });
  });

  // ===========================================================================
  // FetchFileNotFoundError
  // ===========================================================================

  describe('FetchFileNotFoundError', () => {
    it('should create error with path and auto-generated message', () => {
      const error = new FetchFileNotFoundError('/missing/file.pem');
      asserts.assertStrictEquals(error.path, '/missing/file.pem');
      asserts.assert(error.message.includes('/missing/file.pem'));
      asserts.assertStrictEquals(error.name, 'FetchFileNotFoundError');
      asserts.assert(error instanceof Error);
      asserts.assert(error instanceof FetchFileNotFoundError);
    });

    it('should include cause when provided', () => {
      const cause = new Error('ENOENT');
      const error = new FetchFileNotFoundError('/path', cause);
      asserts.assertStrictEquals(error.cause, cause);
    });

    it('should serialize to JSON with path', () => {
      const error = new FetchFileNotFoundError('/test/path.pem');
      const json = error.toJSON();
      asserts.assertStrictEquals(json.name, 'FetchFileNotFoundError');
      asserts.assertStrictEquals(json.path, '/test/path.pem');
      asserts.assert(typeof json.message === 'string');
    });
  });

  // ===========================================================================
  // FetchInvalidPEMError
  // ===========================================================================

  describe('FetchInvalidPEMError', () => {
    it('should extend FetchTLSError', () => {
      const error = new FetchInvalidPEMError('Invalid PEM', 'cert');
      asserts.assert(error instanceof FetchTLSError);
      asserts.assert(error instanceof Error);
      asserts.assertStrictEquals(error.name, 'FetchInvalidPEMError');
      asserts.assertStrictEquals(error.source, 'cert');
    });

    it('should include cause when provided', () => {
      const cause = new Error('parse failed');
      const error = new FetchInvalidPEMError('bad PEM', 'key', cause);
      asserts.assertStrictEquals(error.cause, cause);
    });

    it('should serialize to JSON correctly', () => {
      const error = new FetchInvalidPEMError('bad format', 'key');
      const json = error.toJSON();
      asserts.assertStrictEquals(json.name, 'FetchInvalidPEMError');
      asserts.assertStrictEquals(json.source, 'key');
    });
  });

  // ===========================================================================
  // FetchPathTraversalError
  // ===========================================================================

  describe('FetchPathTraversalError', () => {
    it('should create error with path, reason, and auto-generated message', () => {
      const error = new FetchPathTraversalError('../secret');
      asserts.assertStrictEquals(error.path, '../secret');
      asserts.assertStrictEquals(error.reason, 'path_traversal');
      asserts.assertStrictEquals(error.name, 'FetchPathTraversalError');
      asserts.assert(error.message.includes('../secret'));
      asserts.assert(error instanceof Error);
      asserts.assert(error instanceof FetchPathTraversalError);
    });

    it('should include cause when provided', () => {
      const cause = new Error('path check failed');
      const error = new FetchPathTraversalError('/bad/path', cause);
      asserts.assertStrictEquals(error.cause, cause);
    });

    it('should serialize to JSON with path and reason', () => {
      const error = new FetchPathTraversalError('../../../etc');
      const json = error.toJSON();
      asserts.assertStrictEquals(json.name, 'FetchPathTraversalError');
      asserts.assertStrictEquals(json.path, '../../../etc');
      asserts.assertStrictEquals(json.reason, 'path_traversal');
    });
  });

  // ===========================================================================
  // validateTLSContent
  // ===========================================================================

  describe('validateTLSContent', () => {
    it('should return empty object when no arguments provided', () => {
      const result = validateTLSContent();
      asserts.assertEquals(result.cert, undefined);
      asserts.assertEquals(result.key, undefined);
      asserts.assertEquals(result.ca, undefined);
    });

    it('should return validated cert and key for valid PEM pair', () => {
      const result = validateTLSContent(VALID_CERT, VALID_KEY);
      asserts.assertStrictEquals(result.cert, VALID_CERT);
      asserts.assertStrictEquals(result.key, VALID_KEY);
      asserts.assertEquals(result.ca, undefined);
    });

    it('should throw FetchInvalidPEMError when only cert provided', () => {
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, undefined),
        FetchInvalidPEMError,
        'key',
      );
    });

    it('should throw FetchInvalidPEMError when only key provided', () => {
      asserts.assertThrows(
        () => validateTLSContent(undefined, VALID_KEY),
        FetchInvalidPEMError,
        'cert',
      );
    });

    it('should throw FetchInvalidPEMError for invalid cert format', () => {
      asserts.assertThrows(
        () => validateTLSContent('not-a-pem', VALID_KEY),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for cert with wrong PEM type', () => {
      // Using a key where certificate is expected
      asserts.assertThrows(
        () => validateTLSContent(VALID_KEY, VALID_KEY),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for invalid key format', () => {
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, 'not-a-key'),
        FetchInvalidPEMError,
      );
    });

    it('should return cert, key, and ca for valid CA array', () => {
      const result = validateTLSContent(VALID_CERT, VALID_KEY, [VALID_CERT]);
      asserts.assertStrictEquals(result.cert, VALID_CERT);
      asserts.assertStrictEquals(result.key, VALID_KEY);
      asserts.assertExists(result.ca);
      asserts.assertEquals(result.ca!.length, 1);
      asserts.assertStrictEquals(result.ca![0], VALID_CERT);
    });

    it('should throw FetchInvalidPEMError for invalid CA cert', () => {
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, VALID_KEY, ['not-a-pem']),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for CA with wrong PEM type', () => {
      // Using a key where certificate is expected for CA
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, VALID_KEY, [VALID_KEY]),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for invalid CA at index 1', () => {
      asserts.assertThrows(
        () =>
          validateTLSContent(VALID_CERT, VALID_KEY, [VALID_CERT, 'invalid']),
        FetchInvalidPEMError,
      );
    });

    it('should set ca to undefined for empty CA array', () => {
      const result = validateTLSContent(VALID_CERT, VALID_KEY, []);
      asserts.assertEquals(result.ca, undefined);
    });

    it('should throw FetchInvalidPEMError for empty string in CA array', () => {
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, VALID_KEY, ['']),
        FetchInvalidPEMError,
      );
    });

    it('should accept CA only (no cert/key)', () => {
      const result = validateTLSContent(undefined, undefined, [VALID_CERT]);
      asserts.assertEquals(result.cert, undefined);
      asserts.assertEquals(result.key, undefined);
      asserts.assertExists(result.ca);
      asserts.assertEquals(result.ca!.length, 1);
    });

    it('should throw FetchInvalidPEMError for oversized cert (exceeds 1MB)', () => {
      const oversizedCert = `-----BEGIN CERTIFICATE-----\n${
        'A'.repeat(1_100_000)
      }\n-----END CERTIFICATE-----`;
      asserts.assertThrows(
        () => validateTLSContent(oversizedCert, VALID_KEY),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for oversized key (exceeds 1MB)', () => {
      const oversizedKey = `-----BEGIN PRIVATE KEY-----\n${
        'B'.repeat(1_100_000)
      }\n-----END PRIVATE KEY-----`;
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, oversizedKey),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for oversized CA cert', () => {
      const oversizedCa = `-----BEGIN CERTIFICATE-----\n${
        'C'.repeat(1_100_000)
      }\n-----END CERTIFICATE-----`;
      asserts.assertThrows(
        () => validateTLSContent(VALID_CERT, VALID_KEY, [oversizedCa]),
        FetchInvalidPEMError,
      );
    });

    it('should throw FetchInvalidPEMError for cert missing END marker', () => {
      const badCert =
        `-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAKHHCgVZU7OXMA0G`;
      asserts.assertThrows(
        () => validateTLSContent(badCert, VALID_KEY),
        FetchInvalidPEMError,
      );
    });
  });

  // ===========================================================================
  // validateTLSFiles
  // ===========================================================================

  describe('validateTLSFiles', () => {
    it('should return empty object when no arguments provided', () => {
      const result = validateTLSFiles();
      asserts.assertEquals(result.cert, undefined);
      asserts.assertEquals(result.key, undefined);
      asserts.assertEquals(result.ca, undefined);
    });

    it('should throw FetchInvalidPEMError when only certFile provided', () => {
      asserts.assertThrows(
        () => validateTLSFiles('/some/cert.pem', undefined),
        FetchInvalidPEMError,
        'keyFile',
      );
    });

    it('should throw FetchInvalidPEMError when only keyFile provided', () => {
      asserts.assertThrows(
        () => validateTLSFiles(undefined, '/some/key.pem'),
        FetchInvalidPEMError,
        'certFile',
      );
    });

    it('should throw FetchPathTraversalError for ../ in certFile', () => {
      asserts.assertThrows(
        () => validateTLSFiles('../../../etc/cert.pem', 'key.pem'),
        FetchPathTraversalError,
      );
    });

    it('should throw FetchPathTraversalError for ../ in keyFile', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      try {
        writeTextFileSync(certPath, VALID_CERT);
        asserts.assertThrows(
          () => validateTLSFiles(certPath, '../../../etc/key.pem'),
          FetchPathTraversalError,
        );
      } finally {
        removeSync(tempDir);
      }
    });

    it('should throw FetchPathTraversalError for ../ in caFile', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      const keyPath = join(tempDir, 'key.pem');
      try {
        writeTextFileSync(certPath, VALID_CERT);
        writeTextFileSync(keyPath, VALID_KEY);
        asserts.assertThrows(
          () => validateTLSFiles(certPath, keyPath, '../../../etc/ca.pem'),
          FetchPathTraversalError,
        );
      } finally {
        removeSync(tempDir);
      }
    });

    it('should throw FetchPathTraversalError for null byte in path', () => {
      asserts.assertThrows(
        () => validateTLSFiles('/path/cert\0pem', '/path/key.pem'),
        FetchPathTraversalError,
      );
    });

    it('should throw FetchFileNotFoundError for non-existent certFile', () => {
      asserts.assertThrows(
        () =>
          validateTLSFiles(
            '/nonexistent/cert.pem',
            '/nonexistent/key.pem',
          ),
        FetchFileNotFoundError,
      );
    });

    it('should read valid PEM files and return validated TLS', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      const keyPath = join(tempDir, 'key.pem');

      try {
        writeTextFileSync(certPath, VALID_CERT);
        writeTextFileSync(keyPath, VALID_KEY);

        const result = validateTLSFiles(certPath, keyPath);
        asserts.assertStrictEquals(result.cert, VALID_CERT);
        asserts.assertStrictEquals(result.key, VALID_KEY);
        asserts.assertEquals(result.ca, undefined);
      } finally {
        removeSync(tempDir);
      }
    });

    it('should read valid PEM cert, key, and CA files', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      const keyPath = join(tempDir, 'key.pem');
      const caPath = join(tempDir, 'ca.pem');

      try {
        writeTextFileSync(certPath, VALID_CERT);
        writeTextFileSync(keyPath, VALID_KEY);
        writeTextFileSync(caPath, VALID_CERT);

        const result = validateTLSFiles(certPath, keyPath, caPath);
        asserts.assertStrictEquals(result.cert, VALID_CERT);
        asserts.assertStrictEquals(result.key, VALID_KEY);
        asserts.assertExists(result.ca);
        asserts.assertEquals(result.ca!.length, 1);
      } finally {
        removeSync(tempDir);
      }
    });

    it('should throw FetchFileNotFoundError for non-existent caFile', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      const keyPath = join(tempDir, 'key.pem');

      try {
        writeTextFileSync(certPath, VALID_CERT);
        writeTextFileSync(keyPath, VALID_KEY);

        asserts.assertThrows(
          () => validateTLSFiles(certPath, keyPath, '/nonexistent/ca.pem'),
          FetchFileNotFoundError,
        );
      } finally {
        removeSync(tempDir);
      }
    });

    it('should throw FetchInvalidPEMError for file with invalid PEM content', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      const keyPath = join(tempDir, 'key.pem');

      try {
        writeTextFileSync(certPath, 'this is not a valid PEM');
        writeTextFileSync(keyPath, VALID_KEY);

        asserts.assertThrows(
          () => validateTLSFiles(certPath, keyPath),
          FetchInvalidPEMError,
        );
      } finally {
        removeSync(tempDir);
      }
    });
  });

  // ===========================================================================
  // validateTLS
  // ===========================================================================

  describe('validateTLS', () => {
    it('routes inline PEM content through content validation', () => {
      const result = validateTLS({ cert: VALID_CERT, key: VALID_KEY });
      asserts.assertEquals(result.cert, VALID_CERT);
      asserts.assertEquals(result.key, VALID_KEY);
    });

    it('routes file paths through file validation', () => {
      const tempDir = makeTempDirSync({ prefix: 'common_test_' });
      const certPath = join(tempDir, 'cert.pem');
      const keyPath = join(tempDir, 'key.pem');
      try {
        writeTextFileSync(certPath, VALID_CERT);
        writeTextFileSync(keyPath, VALID_KEY);
        const result = validateTLS({ certFile: certPath, keyFile: keyPath });
        asserts.assertEquals(result.cert, VALID_CERT);
        asserts.assertEquals(result.key, VALID_KEY);
      } finally {
        removeSync(tempDir);
      }
    });

    it('throws FetchTLSError when inline content and file paths are mixed', () => {
      asserts.assertThrows(
        () => validateTLS({ cert: VALID_CERT, certFile: '/some/cert.pem' }),
        FetchTLSError,
        'cannot mix',
      );
    });

    it('returns an empty result when no material is supplied', () => {
      const result = validateTLS({});
      asserts.assertEquals(result.cert, undefined);
      asserts.assertEquals(result.key, undefined);
      asserts.assertEquals(result.ca, undefined);
    });
  });

  // ===========================================================================
  // combineSignals
  // ===========================================================================

  describe('combineSignals', () => {
    it('should return undefined when no timeout or signal provided', () => {
      const result = combineSignals();
      asserts.assertEquals(result, undefined);
    });

    it('should return undefined when both are undefined', () => {
      const result = combineSignals(undefined, undefined);
      asserts.assertEquals(result, undefined);
    });

    it('should return AbortSignal when only timeout provided', () => {
      const result = combineSignals(5000);
      asserts.assertExists(result);
      asserts.assert(result instanceof AbortSignal);
    });

    it('should return the same signal when only signal provided', () => {
      const controller = new AbortController();
      const result = combineSignals(undefined, controller.signal);
      asserts.assertStrictEquals(result, controller.signal);
    });

    it('should return combined AbortSignal when both timeout and signal provided', () => {
      const controller = new AbortController();
      const result = combineSignals(5000, controller.signal);
      asserts.assertExists(result);
      asserts.assert(result instanceof AbortSignal);
    });

    it('should abort combined signal when timeout elapses', async () => {
      const controller = new AbortController();
      const result = combineSignals(50, controller.signal);
      asserts.assertExists(result);

      // Wait for the timeout to fire rather than racing a fixed sleep.
      await waitForAbort(result!);
      asserts.assert(result!.aborted, 'Signal should be aborted after timeout');
    });

    it('should abort combined signal when custom signal is aborted', async () => {
      const controller = new AbortController();
      const result = combineSignals(5000, controller.signal); // Long timeout
      asserts.assertExists(result);

      // Abort the controller and wait for the abort to propagate.
      controller.abort();
      await waitForAbort(result!);
      asserts.assert(
        result!.aborted,
        'Signal should be aborted when controller aborts',
      );
    });

    it('should abort timeout-only signal after specified duration', async () => {
      const result = combineSignals(50);
      asserts.assertExists(result);
      asserts.assert(!result!.aborted, 'Signal should not be aborted yet');

      await waitForAbort(result!);
      asserts.assert(
        result!.aborted,
        'Signal should be aborted after timeout',
      );
    });

    it('should use fallback combination when AbortSignal.any is unavailable', async () => {
      // Temporarily remove AbortSignal.any to test the fallback path
      // deno-lint-ignore no-explicit-any
      const originalAny = (AbortSignal as any).any;
      try {
        // deno-lint-ignore no-explicit-any
        (AbortSignal as any).any = undefined;

        const controller = new AbortController();
        const result = combineSignals(5000, controller.signal);
        asserts.assertExists(result);
        asserts.assert(result instanceof AbortSignal);
        asserts.assert(!result!.aborted, 'Should not be aborted yet');

        // Aborting the controller should abort the combined signal
        controller.abort();
        await waitForAbort(result!);
        asserts.assert(result!.aborted, 'Combined signal should be aborted');
      } finally {
        // deno-lint-ignore no-explicit-any
        (AbortSignal as any).any = originalAny;
      }
    });

    it('should use fallback combination with pre-aborted signal', async () => {
      // deno-lint-ignore no-explicit-any
      const originalAny = (AbortSignal as any).any;
      try {
        // deno-lint-ignore no-explicit-any
        (AbortSignal as any).any = undefined;

        const controller = new AbortController();
        controller.abort(); // Already aborted

        const result = combineSignals(5000, controller.signal);
        asserts.assertExists(result);
        // Pre-aborted input → combined signal is already aborted synchronously.
        await waitForAbort(result!);
        asserts.assert(result!.aborted, 'Should be aborted immediately');
      } finally {
        // deno-lint-ignore no-explicit-any
        (AbortSignal as any).any = originalAny;
      }
    });
  });

  // ===========================================================================
  // validateUnixSocket
  // ===========================================================================

  describe('validateUnixSocket', () => {
    it('should throw FetchPathTraversalError for path with ../', async () => {
      await asserts.assertRejects(
        () => validateUnixSocket('../../../tmp/evil.sock'),
        FetchPathTraversalError,
      );
    });

    it('should throw FetchPathTraversalError for path with null byte', async () => {
      await asserts.assertRejects(
        () => validateUnixSocket('/tmp/socket\0.sock'),
        FetchPathTraversalError,
      );
    });

    it('should throw FetchFileNotFoundError for non-existent socket path', async () => {
      await asserts.assertRejects(
        () => validateUnixSocket('/tmp/nonexistent-socket-xyz-99999.sock'),
        FetchFileNotFoundError,
      );
    });

    it({
      name: 'should resolve for an existing path',
      windows: false, // Unix socket paths only relevant on non-Windows
      fn: async () => {
        const tempDir = makeTempDirSync({ prefix: 'common_test_' });
        // Create a file to simulate a socket file (validateUnixSocket just checks existence)
        const socketPath = join(tempDir, 'test.sock');
        writeTextFileSync(socketPath, '');

        try {
          // Should not throw
          await validateUnixSocket(socketPath);
        } finally {
          removeSync(tempDir);
        }
      },
    });
  });
});
