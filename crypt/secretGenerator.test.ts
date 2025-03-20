import {
  assertEquals,
  assertInstanceOf,
  assertMatch,
  assertThrows,
} from '$asserts';
import { secretGenerator } from './secretGenerator.ts';

Deno.test('secretGenerator', async (t) => {
  await t.step('Generate secret with default parameters', () => {
    const secret = secretGenerator(32) as string;
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 64); // 32 bytes = 64 hex characters
    assertMatch(secret, /^[0-9a-f]{64}$/); // should be all hex characters
  });

  await t.step('Generate secret with different lengths', () => {
    // Test common encryption key sizes
    const tests = [16, 24, 32, 48, 64]; // bytes

    for (const bytes of tests) {
      const secret = secretGenerator(bytes) as string;
      assertEquals(secret.length, bytes * 2); // Each byte becomes 2 hex chars
    }
  });

  await t.step('Generate secret with hex encoding', () => {
    const secret = secretGenerator(32, 'hex') as string;
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 64);
    assertMatch(secret, /^[0-9a-f]{64}$/);
  });

  await t.step('Generate secret with base64 encoding', () => {
    const secret = secretGenerator(32, 'base64') as string;
    assertEquals(typeof secret, 'string');
    // 32 bytes in base64 should be about 44 characters (with possible padding)
    assertMatch(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  await t.step('Generate secret with raw encoding', () => {
    const secret = secretGenerator(32, 'raw') as Uint8Array;
    assertInstanceOf(secret, Uint8Array);
    assertEquals(secret.byteLength, 32);
  });

  await t.step('Generate secret with prefix', () => {
    const prefix = 'key:';
    const secret = secretGenerator(32, 'hex', prefix) as string;
    assertEquals(secret.startsWith(prefix), true);
    assertEquals(secret.length, prefix.length + 64);
  });

  await t.step('Generate secret with raw encoding ignores prefix', () => {
    // Should emit a warning, but we can't easily test for console.warn
    const secret = secretGenerator(32, 'raw', 'prefix') as Uint8Array;
    assertInstanceOf(secret, Uint8Array);
    assertEquals(secret.byteLength, 32);
  });

  await t.step('Throw error for invalid byteLength', () => {
    assertThrows(
      () => secretGenerator(0),
      Error,
      'byteLength must be a positive integer',
    );
    assertThrows(
      () => secretGenerator(-10),
      Error,
      'byteLength must be a positive integer',
    );
    assertThrows(
      () => secretGenerator(1.5),
      Error,
      'byteLength must be a positive integer',
    );
  });

  await t.step('Throw error for invalid encoding', () => {
    assertThrows(
      // deno-lint-ignore no-explicit-any
      () => secretGenerator(32, 'invalid' as any),
      Error,
      'Invalid encoding. Must be "hex", "base64", or "raw"',
    );
  });

  await t.step('Check for collisions in large sample', () => {
    const iterations = 1000; // Lower than keyGenerator test for speed
    const generatedSecrets = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      generatedSecrets.add(secretGenerator(16) as string);
    }

    // All secrets should be unique
    assertEquals(generatedSecrets.size, iterations);
  });
});
