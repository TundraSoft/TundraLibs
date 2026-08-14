import { assert, assertEquals, assertMatch, assertThrows } from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  generateAlphanumericSecret,
  generateBase32Secret,
  generateBase64Secret,
  generateHexSecret,
  generatePassword,
  generateToken,
  secretGenerator,
} from './secret.ts';

describe('crypt.generators.secret', () => {
  it('Generate secret with default parameters', () => {
    const secret = secretGenerator(32);
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 64); // 32 bytes = 64 hex characters
    assertMatch(secret, /^[0-9a-f]{64}$/);
  });

  it('Generate secret with different lengths', () => {
    // Test common encryption key sizes
    const tests = [16, 24, 32, 48, 64]; // bytes

    for (const bytes of tests) {
      const secret = secretGenerator(bytes);
      assertEquals(secret.length, bytes * 2); // Each byte becomes 2 hex chars
    }
  });

  it('Generate secret with hex encoding', () => {
    const secret = secretGenerator(32, 'HEX');
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 64);
    assertMatch(secret, /^[0-9a-f]{64}$/);
  });

  it('Generate secret with base64 encoding', () => {
    const secret = secretGenerator(32, 'BASE64');
    assertEquals(typeof secret, 'string');
    assertMatch(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  it('Generate secret with base32 encoding', () => {
    const secret = secretGenerator(32, 'BASE32');
    assertEquals(typeof secret, 'string');
    assertMatch(secret, /^[A-Z2-7]+=*$/);
  });

  it('Generate secret with alphanumeric encoding', () => {
    const secret = secretGenerator(16, 'ALPHANUMERIC');
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 16);
    assertMatch(secret, /^[0-9a-zA-Z]{16}$/);
  });

  it('Generate secret with options object', () => {
    const secret = secretGenerator({
      byteLength: 16,
      encoding: 'BASE64',
    });

    assertEquals(typeof secret, 'string');
    assertMatch(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  it('Throw error for invalid byteLength', () => {
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

  it('Throw error for invalid encoding', () => {
    assertThrows(
      // deno-lint-ignore no-explicit-any
      () => secretGenerator(32, 'invalid' as any),
      Error,
      'Invalid encoding. Must be "HEX", "BASE64", "BASE32", or "ALPHANUMERIC"',
    );
  });

  it('Check for collisions in large sample', () => {
    const iterations = 1000;
    const generatedSecrets = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      generatedSecrets.add(secretGenerator(16));
    }

    // All secrets should be unique
    assertEquals(generatedSecrets.size, iterations);
  });
});

describe('crypt.generators.secret - Convenience Functions', () => {
  it('generateHexSecret - basic functionality', () => {
    const secret = generateHexSecret(16);
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 32); // 16 bytes = 32 hex chars
    assertMatch(secret, /^[0-9a-f]{32}$/);
  });

  it('generateHexSecret - different sizes', () => {
    const secret8 = generateHexSecret(8);
    const secret32 = generateHexSecret(32);
    assertEquals(secret8.length, 16);
    assertEquals(secret32.length, 64);
  });

  it('generateBase64Secret - basic functionality', () => {
    const secret = generateBase64Secret(24);
    assertEquals(typeof secret, 'string');
    assertMatch(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  it('generateBase32Secret - basic functionality', () => {
    const secret = generateBase32Secret(20);
    assertEquals(typeof secret, 'string');
    assertMatch(secret, /^[A-Z2-7]+=*$/);
  });

  it('generateAlphanumericSecret - basic functionality', () => {
    const secret = generateAlphanumericSecret(16);
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length, 16);
    assertMatch(secret, /^[0-9a-zA-Z]{16}$/);
  });

  it('generateToken - default parameters', () => {
    const token = generateToken();
    assertEquals(typeof token, 'string');
    assertEquals(token.length, 64); // 32 bytes = 64 hex chars
    assertMatch(token, /^[0-9a-f]{64}$/);
  });

  it('generatePassword - default parameters', () => {
    const password = generatePassword();
    assertEquals(typeof password, 'string');
    assertEquals(password.length, 16);

    // Should contain at least one of each type by default
    assertMatch(password, /[A-Z]/); // uppercase
    assertMatch(password, /[a-z]/); // lowercase
    assertMatch(password, /\d/); // numbers
    assertMatch(password, /[!@#$%^&*]/); // symbols
  });

  it('generatePassword - custom length', () => {
    const password = generatePassword(24);
    assertEquals(typeof password, 'string');
    assertEquals(password.length, 24);
  });

  it('generatePassword - no symbols', () => {
    const password = generatePassword(16, { symbols: false });
    assertEquals(password.length, 16);

    // Should contain uppercase, lowercase, numbers but no symbols
    assertMatch(password, /[A-Z]/);
    assertMatch(password, /[a-z]/);
    assertMatch(password, /\d/);
    assertMatch(password, /^[A-Za-z0-9]+$/); // Only alphanumeric
  });

  it('generatePassword - alphanumeric only', () => {
    const password = generatePassword(12, {
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
    });
    assertEquals(password.length, 12);
    assertMatch(password, /^[A-Za-z0-9]+$/);
  });

  it('generatePassword - custom symbol set', () => {
    const password = generatePassword(20, {
      symbolSet: '!@#$%^&*()_+-=',
    });
    assertEquals(password.length, 20);

    // Should contain custom symbols
    assertMatch(password, /[!@#$%^&*()_+\-=]/);
  });

  it('generatePassword - minimum requirements', () => {
    const password = generatePassword(20, {
      minUppercase: 3,
      minLowercase: 3,
      minNumbers: 3,
      minSymbols: 2,
    });
    assertEquals(password.length, 20);

    // Count each character type
    const uppercaseCount = (password.match(/[A-Z]/g) || []).length;
    const lowercaseCount = (password.match(/[a-z]/g) || []).length;
    const numbersCount = (password.match(/\d/g) || []).length;
    const symbolsCount = (password.match(/[!@#$%^&*]/g) || []).length;

    assertEquals(uppercaseCount >= 3, true, 'Should have at least 3 uppercase');
    assertEquals(lowercaseCount >= 3, true, 'Should have at least 3 lowercase');
    assertEquals(numbersCount >= 3, true, 'Should have at least 3 numbers');
    assertEquals(symbolsCount >= 2, true, 'Should have at least 2 symbols');
  });

  it('generatePassword - only uppercase', () => {
    const password = generatePassword(10, {
      uppercase: true,
      lowercase: false,
      numbers: false,
      symbols: false,
    });
    assertEquals(password.length, 10);
    assertMatch(password, /^[A-Z]+$/);
  });

  it('generatePassword - only lowercase', () => {
    const password = generatePassword(10, {
      uppercase: false,
      lowercase: true,
      numbers: false,
      symbols: false,
    });
    assertEquals(password.length, 10);
    assertMatch(password, /^[a-z]+$/);
  });

  it('generatePassword - error on length too short', () => {
    assertThrows(
      () =>
        generatePassword(5, {
          minUppercase: 2,
          minLowercase: 2,
          minNumbers: 2,
          minSymbols: 2,
        }),
      Error,
      'Password length (5) is too short for minimum requirements (8 characters needed)',
    );
  });

  it('generatePassword - error on no character sets', () => {
    assertThrows(
      () =>
        generatePassword(16, {
          uppercase: false,
          lowercase: false,
          numbers: false,
          symbols: false,
        }),
      Error,
      'At least one character set must be enabled',
    );
  });

  it('generatePassword - uniqueness', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generatePassword(16));
    }
    // All 100 passwords should be unique
    assertEquals(passwords.size, 100);
  });

  it('All convenience functions generate unique outputs', () => {
    const outputs = new Set([
      generateHexSecret(16),
      generateBase64Secret(16),
      generateBase32Secret(16),
      generateAlphanumericSecret(16),
      generateToken(),
      generatePassword(),
    ]);

    // All should be unique
    assertEquals(outputs.size, 6);
  });

  // ALPHANUMERIC output must be unbiased. Reducing a raw byte with `byte % 62`
  // over-represents the eight residues 0-7 (characters '0'-'7') by ~25%,
  // because 256 = 62*4 + 8. Draw a large sample and check those eight
  // characters as a group: a uniform generator lands near 8/62 (~12.9%) of the
  // sample while the biased one lands near 40/256 (~15.6%). The 14000
  // threshold sits ~10σ above the uniform mean (~12903) and ~14σ below the
  // biased mean (~15625), so it catches the bias without flaking.
  it('secretGenerator ALPHANUMERIC - unbiased distribution', () => {
    // crypto.getRandomValues caps each call at 65536 bytes, so accumulate the
    // sample across smaller calls.
    const chunk = 1000;
    const chunks = 100;
    const N = chunk * chunks; // 100_000
    let total = 0;
    let lowChars = 0; // count of '0'..'7'
    for (let c = 0; c < chunks; c++) {
      const sample = secretGenerator(chunk, 'ALPHANUMERIC');
      total += sample.length;
      for (const ch of sample) {
        if (ch >= '0' && ch <= '7') lowChars++;
      }
    }
    assertEquals(total, N);

    assert(
      lowChars < 14000,
      `'0'-'7' appeared ${lowChars}/${N} times; a uniform generator expects ` +
        `~12903 (< 14000), the biased 'byte % 62' expects ~15625`,
    );
  });
});
