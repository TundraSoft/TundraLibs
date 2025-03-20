import { assertEquals } from '$asserts';
import { deriveKey, validateKey } from './mod.ts';

Deno.test('validateKey', async (t) => {
  await t.step('validates key length correctly', () => {
    // Key with sufficient length
    const validKey = 'abcdefghijklmnop'; // 16 bytes
    assertEquals(validateKey(validKey, 128), true); // 128 bits = 16 bytes

    // Key that's exactly the right length
    assertEquals(validateKey(validKey, 128), true);

    // Key with insufficient length
    const shortKey = 'abcd'; // 4 bytes
    assertEquals(validateKey(shortKey, 128), false);

    // Edge case: empty key
    assertEquals(validateKey('', 128), false);

    // Edge case: key that's just long enough
    assertEquals(validateKey('a'.repeat(32), 256), true);

    // Edge case: key that's just shy of long enough
    assertEquals(validateKey('a'.repeat(31), 256), false);

    // Check various bit lengths
    assertEquals(validateKey('abcdefghijklmnopqrstuvwxyzabcdef', 256), true); // 32 bytes = 256 bits
    assertEquals(
      validateKey(
        '35361eddb9a91979c1b665ab665e0b937d7223f5977c0ffd520c11c91ae510f5f848e26bcd6851a081a19531ecbf4ef6',
        384,
      ),
      true,
    ); // 48 bytes = 384 bits
    assertEquals(
      validateKey(
        '4cd67fd04999410f37e9ea6d66c0e0f9de72fb313e2cb3efd216d303281f6a8026a7d17a298eb2819b0e4ded10034495',
        512,
      ),
      true,
    ); // 64 bytes = 512 bits
  });

  await t.step('handles non-ASCII characters correctly', () => {
    // Unicode characters take more bytes in UTF-8
    const unicodeKey = '💻🔐'; // 2 emojis, 8 bytes total (4 bytes each)
    assertEquals(validateKey(unicodeKey, 64), true); // 64 bits = 8 bytes
    assertEquals(validateKey(unicodeKey, 65), false); // 9 bytes needed, only 8 provided
  });
});

Deno.test('deriveKey', async (t) => {
  await t.step('truncates keys that are too long', () => {
    const longKey = 'abcdefghijklmnopqrstuvwxyz'; // 26 bytes
    const requiredBytes = 16;
    const derived = deriveKey(longKey, requiredBytes);

    // Check that the derived key has the correct length
    assertEquals(derived.byteLength, requiredBytes);

    // Check that it contains the truncated key
    const expectedBytes = new TextEncoder().encode(
      longKey.substring(0, requiredBytes),
    );
    for (let i = 0; i < requiredBytes; i++) {
      assertEquals(derived[i], expectedBytes[i]);
    }
  });

  await t.step('pads keys that are too short', () => {
    const shortKey = 'abcd'; // 4 bytes
    const requiredBytes = 16;
    const derived = deriveKey(shortKey, requiredBytes);

    // Check that the derived key has the correct length
    assertEquals(derived.byteLength, requiredBytes);

    // Check that it contains the original key at the beginning
    const shortKeyBytes = new TextEncoder().encode(shortKey);
    for (let i = 0; i < shortKeyBytes.length; i++) {
      assertEquals(derived[i], shortKeyBytes[i]);
    }

    // Check that the rest is padded with zeros
    for (let i = shortKeyBytes.length; i < requiredBytes; i++) {
      assertEquals(derived[i], 0);
    }
  });

  await t.step('keeps keys that are exactly the right length unchanged', () => {
    const exactKey = 'abcdefghijklmnop'; // 16 bytes
    const requiredBytes = 16;
    const derived = deriveKey(exactKey, requiredBytes);

    // Check that the derived key has the correct length
    assertEquals(derived.byteLength, requiredBytes);

    // Check that it contains the original key unchanged
    const exactKeyBytes = new TextEncoder().encode(exactKey);
    for (let i = 0; i < requiredBytes; i++) {
      assertEquals(derived[i], exactKeyBytes[i]);
    }
  });

  await t.step('handles various byte lengths', () => {
    // Test with common encryption key sizes
    [16, 24, 32, 48, 64].forEach((bytes) => {
      const key = 'a'.repeat(bytes / 2); // Create a key half the required length
      const derived = deriveKey(key, bytes);
      assertEquals(derived.byteLength, bytes);
    });
  });

  await t.step('handles empty input correctly', () => {
    const emptyKey = '';
    const requiredBytes = 16;
    const derived = deriveKey(emptyKey, requiredBytes);

    // Check that the derived key has the correct length
    assertEquals(derived.byteLength, requiredBytes);

    // Check that it's all zeros
    for (let i = 0; i < requiredBytes; i++) {
      assertEquals(derived[i], 0);
    }
  });

  await t.step('handles non-ASCII characters correctly', () => {
    // Unicode characters
    const unicodeKey = '💻🔐'; // 2 emojis, 8 bytes total
    const requiredBytes = 16;
    const derived = deriveKey(unicodeKey, requiredBytes);

    assertEquals(derived.byteLength, requiredBytes);

    // Check that the first 8 bytes match the unicode key
    const unicodeBytes = new TextEncoder().encode(unicodeKey);
    for (let i = 0; i < unicodeBytes.length; i++) {
      assertEquals(derived[i], unicodeBytes[i]);
    }
  });
});
