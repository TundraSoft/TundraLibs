import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  constantTimeEqual,
  generate,
  numberToBytes,
  validateInputs,
} from './common.ts';

describe('crypt.OTP.common', () => {
  it('numberToBytes - Basic functionality', () => {
    const result = numberToBytes(123);

    asserts.assertInstanceOf(result, Uint8Array);
    asserts.assertEquals(result.length, 8);

    // Verify the big-endian representation
    const dataView = new DataView(result.buffer);
    const value = dataView.getBigUint64(0, false); // false = big-endian
    asserts.assertEquals(value, BigInt(123));
  });

  it('numberToBytes - Zero value', () => {
    const result = numberToBytes(0);
    asserts.assertEquals(result.length, 8);

    // All bytes should be zero
    for (let i = 0; i < 8; i++) {
      asserts.assertEquals(result[i], 0);
    }
  });

  it('numberToBytes - Large numbers', () => {
    const largeNumber = 4294967295; // 2^32 - 1
    const result = numberToBytes(largeNumber);

    const dataView = new DataView(result.buffer);
    const value = dataView.getBigUint64(0, false);
    asserts.assertEquals(value, BigInt(largeNumber));
  });

  it('numberToBytes - Invalid inputs', () => {
    // Negative number
    asserts.assertThrows(
      () => numberToBytes(-1),
      Error,
      'Counter must be a non-negative integer',
    );

    // Non-integer
    asserts.assertThrows(
      () => numberToBytes(3.14),
      Error,
      'Counter must be a non-negative integer',
    );

    // NaN
    asserts.assertThrows(
      () => numberToBytes(Number.NaN),
      Error,
      'Counter must be a non-negative integer',
    );
  });

  it('validateInputs - Valid string key', () => {
    // Should not throw for valid inputs
    validateInputs('my-secret-key-16-chars', 0, 6, 'SHA-256');
    // If we reach here, it means no error was thrown
    asserts.assert(true);
  });

  it('validateInputs - Invalid string key', () => {
    // Empty string
    asserts.assertThrows(
      () => validateInputs('', 0, 6, 'SHA-256'),
      Error,
      'Secret key should be at least 16 characters long',
    );

    // Too short
    asserts.assertThrows(
      () => validateInputs('short', 0, 6, 'SHA-256'),
      Error,
      'Secret key should be at least 16 characters long',
    );

    // Exactly 15 characters (should fail)
    asserts.assertThrows(
      () => validateInputs('fifteen-chars!!', 0, 6, 'SHA-256'),
      Error,
      'Secret key should be at least 16 characters long',
    );
  });

  it('validateInputs - Invalid counter', () => {
    const validKey = 'my-secret-key-16-chars';

    // Negative counter
    asserts.assertThrows(
      () => validateInputs(validKey, -1, 6, 'SHA-256'),
      Error,
      'Counter must be a non-negative integer',
    );

    // Non-integer counter
    asserts.assertThrows(
      () => validateInputs(validKey, 3.14, 6, 'SHA-256'),
      Error,
      'Counter must be a non-negative integer',
    );

    // NaN counter
    asserts.assertThrows(
      () => validateInputs(validKey, Number.NaN, 6, 'SHA-256'),
      Error,
      'Counter must be a non-negative integer',
    );
  });

  it('validateInputs - Invalid OTP length', () => {
    const validKey = 'my-secret-key-16-chars';

    // Zero length
    asserts.assertThrows(
      () => validateInputs(validKey, 0, 0, 'SHA-256'),
      Error,
      'OTP length must be a non-negative integer',
    );

    // Negative length
    asserts.assertThrows(
      () => validateInputs(validKey, 0, -1, 'SHA-256'),
      Error,
      'OTP length must be a non-negative integer',
    );

    // Non-integer length
    asserts.assertThrows(
      () => validateInputs(validKey, 0, 6.5, 'SHA-256'),
      Error,
      'OTP length must be a non-negative integer',
    );
  });

  it('validateInputs - Invalid algorithm', () => {
    const validKey = 'my-secret-key-16-chars';

    // Unsupported algorithm
    asserts.assertThrows(
      // @ts-expect-error testing invalid input
      () => validateInputs(validKey, 0, 6, 'MD5'),
      Error,
      'The provided algorithm name is not supported',
    );

    // Invalid algorithm
    asserts.assertThrows(
      // @ts-expect-error testing invalid input
      () => validateInputs(validKey, 0, 6, 'INVALID'),
      Error,
      'The provided algorithm name is not supported',
    );
  });

  it('validateInputs - All supported algorithms', () => {
    const validKey = 'my-secret-key-16-chars';
    const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

    for (const algo of algorithms) {
      validateInputs(validKey, 0, 6, algo);
      // If we reach here for each algorithm, it means no error was thrown
    }
    asserts.assert(true);
  });

  it('generate - Basic OTP generation', async () => {
    const key = 'my-secret-key-16-chars';
    const otp = await generate(key, 0, 6, 'SHA-256');

    asserts.assertEquals(typeof otp, 'string');
    asserts.assertEquals(otp.length, 6);
    asserts.assert(/^\d{6}$/.test(otp), 'OTP should be 6 digits');
  });

  it('generate - Different lengths', async () => {
    const key = 'my-secret-key-16-chars';

    for (const length of [4, 6, 8, 10]) {
      const otp = await generate(key, 0, length, 'SHA-256');
      asserts.assertEquals(otp.length, length);
      asserts.assert(new RegExp(`^\\d{${length}}$`).test(otp));
    }
  });

  it('generate - Different algorithms', async () => {
    const key = 'my-secret-key-16-chars';
    const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

    for (const algo of algorithms) {
      const otp = await generate(key, 0, 6, algo);
      asserts.assertEquals(typeof otp, 'string');
      asserts.assertEquals(otp.length, 6);
      asserts.assert(/^\d{6}$/.test(otp));
    }
  });

  it('generate - Counter consistency', async () => {
    const key = 'my-secret-key-16-chars';

    // Same inputs should produce same output
    const otp1 = await generate(key, 123, 6, 'SHA-256');
    const otp2 = await generate(key, 123, 6, 'SHA-256');
    asserts.assertEquals(otp1, otp2);

    // Different counters should produce different outputs
    const otp3 = await generate(key, 124, 6, 'SHA-256');
    asserts.assertNotEquals(otp1, otp3);
  });

  it('generate - Key consistency', async () => {
    const key1 = 'my-secret-key-16-chars';
    const key2 = 'different-key-16-char';

    const otp1 = await generate(key1, 0, 6, 'SHA-256');
    const otp2 = await generate(key2, 0, 6, 'SHA-256');

    // Different keys should produce different outputs
    asserts.assertNotEquals(otp1, otp2);
  });

  it('generate - Leading zeros padding', async () => {
    const key = 'my-secret-key-16-chars';

    // Test with many different counters to increase chance of getting leading zeros
    const otps = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const otp = await generate(key, i, 6, 'SHA-256');
      asserts.assertEquals(otp.length, 6);
      asserts.assert(/^\d{6}$/.test(otp));
      otps.add(otp);
    }

    // Should have many unique OTPs
    asserts.assert(otps.size > 50, 'Should generate many unique OTPs');
  });

  it('generate - Default parameters', async () => {
    const key = 'my-secret-key-16-chars';

    // Test default length and algorithm
    const otp = await generate(key, 0);
    asserts.assertEquals(otp.length, 6); // Default length
    asserts.assert(/^\d{6}$/.test(otp));
  });

  it('generate - Large counter values', async () => {
    const key = 'my-secret-key-16-chars';
    const largeCounter = 4294967295; // 2^32 - 1

    const otp = await generate(key, largeCounter, 6, 'SHA-256');
    asserts.assertEquals(typeof otp, 'string');
    asserts.assertEquals(otp.length, 6);
    asserts.assert(/^\d{6}$/.test(otp));
  });

  it('generate - Input validation errors', async () => {
    // Should propagate validation errors
    await asserts.assertRejects(
      async () => await generate('short', 0, 6, 'SHA-256'),
      Error,
      'Secret key should be at least 16 characters long',
    );

    await asserts.assertRejects(
      async () => await generate('my-secret-key-16-chars', -1, 6, 'SHA-256'),
      Error,
      'Counter must be a non-negative integer',
    );

    await asserts.assertRejects(
      async () => await generate('my-secret-key-16-chars', 0, 0, 'SHA-256'),
      Error,
      'OTP length must be a non-negative integer',
    );

    await asserts.assertRejects(
      async () =>
        // @ts-expect-error testing invalid input
        await generate('my-secret-key-16-chars', 0, 6, 'INVALID'),
      Error,
      'The provided algorithm name is not supported',
    );
  });

  it('generate - Consistency with same inputs', async () => {
    // Generate OTP multiple times with same inputs
    const secret = 'my-secret-key-16-chars';
    const counter = 12345;
    const length = 6;

    const otp1 = await generate(secret, counter, length);
    const otp2 = await generate(secret, counter, length);
    const otp3 = await generate(secret, counter, length);

    // All should be identical
    asserts.assertEquals(otp1, otp2);
    asserts.assertEquals(otp2, otp3);
  });

  it('constantTimeEqual - Matching and mismatching codes', () => {
    // Identical strings compare equal.
    asserts.assertEquals(constantTimeEqual('123456', '123456'), true);
    asserts.assertEquals(constantTimeEqual('', ''), true);

    // Any single-character difference returns false.
    asserts.assertEquals(constantTimeEqual('123456', '123457'), false);
    asserts.assertEquals(constantTimeEqual('123456', '923456'), false);

    // A correct prefix is not accepted (would pass a short-circuiting ===
    // only if equal, but must still reject differing length).
    asserts.assertEquals(constantTimeEqual('123456', '12345'), false);
    asserts.assertEquals(constantTimeEqual('12345', '123456'), false);

    // Length mismatch where one is a prefix of the other.
    asserts.assertEquals(constantTimeEqual('000000', '0000000'), false);
  });

  it('constantTimeEqual - Matches generate output', async () => {
    const key = 'my-secret-key-16-chars';
    const otp = await generate(key, 7, 6, 'SHA-256');
    asserts.assertEquals(constantTimeEqual(otp, otp), true);
    // Flip the last digit and ensure it no longer matches.
    const tampered = otp.slice(0, -1) +
      ((Number(otp.slice(-1)) + 1) % 10).toString();
    asserts.assertEquals(constantTimeEqual(otp, tampered), false);
  });

  it('generate - Different counters produce different OTPs', async () => {
    const secret = 'my-secret-key-16-chars';
    const length = 6;

    const otp1 = await generate(secret, 1, length);
    const otp2 = await generate(secret, 2, length);
    const otp3 = await generate(secret, 3, length);

    // All should be different
    asserts.assertEquals(otp1 !== otp2, true);
    asserts.assertEquals(otp2 !== otp3, true);
    asserts.assertEquals(otp1 !== otp3, true);
  });
});
