import { assert, assertEquals, assertRejects } from '$asserts';
import {
  BIP39_ENGLISH_WORDLIST,
  generate12WordSeed,
  generate24WordSeed,
  generateBIP39Mnemonic,
  generateSeedPhrase,
  mnemonicToSeed,
  validateBIP39Mnemonic,
  validateSeedPhrase,
} from './bip39.ts';

Deno.test('crypt.generators.bip39', async (t) => {
  await t.step('BIP39_ENGLISH_WORDLIST - basic properties', () => {
    assertEquals(BIP39_ENGLISH_WORDLIST.length, 2048);
    assertEquals(typeof BIP39_ENGLISH_WORDLIST[0], 'string');
    assertEquals(BIP39_ENGLISH_WORDLIST[0], 'abandon');
    assertEquals(BIP39_ENGLISH_WORDLIST[2047], 'zoo');
  });

  await t.step('generateBIP39Mnemonic - 12 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 12 });
    assertEquals(result.words.length, 12);
    assertEquals(result.phrase.split(' ').length, 12);
    assertEquals(result.entropy.length, 16); // 128 bits = 16 bytes
    assertEquals(result.seed.length, 64); // 512 bits = 64 bytes
  });

  await t.step('generateBIP39Mnemonic - 24 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 24 });
    assertEquals(result.words.length, 24);
    assertEquals(result.phrase.split(' ').length, 24);
    assertEquals(result.entropy.length, 32); // 256 bits = 32 bytes
    assertEquals(result.seed.length, 64); // 512 bits = 64 bytes
  });

  await t.step('validateBIP39Mnemonic - valid mnemonic', async () => {
    const validMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const isValid = await validateBIP39Mnemonic(validMnemonic);
    assert(isValid, 'Known valid mnemonic should be valid');
  });

  await t.step('validateBIP39Mnemonic - invalid mnemonic', async () => {
    const invalidMnemonic = 'invalid word list that does not match bip39';
    const isValid = await validateBIP39Mnemonic(invalidMnemonic);
    assert(!isValid, 'Invalid mnemonic should be invalid');
  });

  await t.step('mnemonicToSeed - consistent output', async () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = await mnemonicToSeed(mnemonic, '');
    const seed2 = await mnemonicToSeed(mnemonic, '');

    assertEquals(seed1.length, 64, 'Seed should be 64 bytes');
    assertEquals(seed2.length, 64, 'Seed should be 64 bytes');

    // Compare arrays byte by byte
    for (let i = 0; i < seed1.length; i++) {
      assertEquals(seed1[i], seed2[i], 'Seeds should be identical');
    }
  });

  await t.step('generate12WordSeed - basic functionality', async () => {
    const seed = await generate12WordSeed();
    const words = seed.phrase.split(' ');
    assertEquals(words.length, 12);
    assertEquals(seed.seed.length, 64);
  });

  await t.step('generate24WordSeed - basic functionality', async () => {
    const seed = await generate24WordSeed();
    const words = seed.phrase.split(' ');
    assertEquals(words.length, 24);
    assertEquals(seed.seed.length, 64);
  });

  // Test all supported word counts
  await t.step('generateBIP39Mnemonic - 15 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 15 });
    assertEquals(result.words.length, 15);
    assertEquals(result.phrase.split(' ').length, 15);
    assertEquals(result.entropy.length, 20); // 160 bits = 20 bytes
    assertEquals(result.seed.length, 64);
  });

  await t.step('generateBIP39Mnemonic - 18 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 18 });
    assertEquals(result.words.length, 18);
    assertEquals(result.phrase.split(' ').length, 18);
    assertEquals(result.entropy.length, 24); // 192 bits = 24 bytes
    assertEquals(result.seed.length, 64);
  });

  await t.step('generateBIP39Mnemonic - 21 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 21 });
    assertEquals(result.words.length, 21);
    assertEquals(result.phrase.split(' ').length, 21);
    assertEquals(result.entropy.length, 28); // 224 bits = 28 bytes
    assertEquals(result.seed.length, 64);
  });

  // Test passphrase functionality
  await t.step('generateBIP39Mnemonic - with passphrase', async () => {
    const result1 = await generateBIP39Mnemonic({
      wordCount: 12,
      passphrase: 'test passphrase',
    });
    const result2 = await generateBIP39Mnemonic({
      wordCount: 12,
      passphrase: 'different passphrase',
    });

    assertEquals(result1.words.length, 12);
    assertEquals(result2.words.length, 12);
    assertEquals(result1.seed.length, 64);
    assertEquals(result2.seed.length, 64);

    // Different passphrases should produce different seeds even with same entropy
    // We'll test this with mnemonicToSeed directly
    const sameMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = await mnemonicToSeed(sameMnemonic, 'test1');
    const seed2 = await mnemonicToSeed(sameMnemonic, 'test2');

    let seedsAreDifferent = false;
    for (let i = 0; i < seed1.length; i++) {
      if (seed1[i] !== seed2[i]) {
        seedsAreDifferent = true;
        break;
      }
    }
    assert(
      seedsAreDifferent,
      'Different passphrases should produce different seeds',
    );
  });

  // Test custom wordlist
  await t.step('generateBIP39Mnemonic - custom wordlist', async () => {
    // Create a custom wordlist with exactly 2048 words
    const customWordlist = Array.from(
      { length: 2048 },
      (_, i) => `word${i.toString().padStart(4, '0')}`,
    );

    const result = await generateBIP39Mnemonic({
      wordCount: 12,
      wordlist: customWordlist,
    });

    assertEquals(result.words.length, 12);
    assertEquals(result.seed.length, 64);

    // All words should be from custom wordlist
    for (const word of result.words) {
      assert(
        customWordlist.includes(word),
        `Word ${word} should be from custom wordlist`,
      );
    }
  });

  // Error handling tests
  await t.step(
    'generateBIP39Mnemonic - invalid wordlist length (too short)',
    async () => {
      const shortWordlist = Array.from({ length: 1000 }, (_, i) => `word${i}`);

      await assertRejects(
        () => generateBIP39Mnemonic({ wordlist: shortWordlist }),
        Error,
        'Wordlist must contain exactly 2048 words',
      );
    },
  );

  await t.step(
    'generateBIP39Mnemonic - invalid wordlist length (too long)',
    async () => {
      const longWordlist = Array.from({ length: 3000 }, (_, i) => `word${i}`);

      await assertRejects(
        () => generateBIP39Mnemonic({ wordlist: longWordlist }),
        Error,
        'Wordlist must contain exactly 2048 words',
      );
    },
  );

  await t.step('generateBIP39Mnemonic - invalid word count', async () => {
    await assertRejects(
      () => generateBIP39Mnemonic({ wordCount: 13 as any }),
      Error,
      'Word count must be 12, 15, 18, 21, or 24',
    );

    await assertRejects(
      () => generateBIP39Mnemonic({ wordCount: 10 as any }),
      Error,
      'Word count must be 12, 15, 18, 21, or 24',
    );
  });

  // Validation edge cases
  await t.step(
    'validateBIP39Mnemonic - invalid word count (too short)',
    async () => {
      const shortMnemonic = 'abandon abandon abandon';
      const isValid = await validateBIP39Mnemonic(shortMnemonic);
      assert(!isValid, 'Short mnemonic should be invalid');
    },
  );

  await t.step(
    'validateBIP39Mnemonic - invalid word count (too long)',
    async () => {
      const longMnemonic = Array.from({ length: 30 }, () => 'abandon').join(
        ' ',
      );
      const isValid = await validateBIP39Mnemonic(longMnemonic);
      assert(!isValid, 'Long mnemonic should be invalid');
    },
  );

  await t.step('validateBIP39Mnemonic - words not in wordlist', async () => {
    const invalidWordMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon invalidword';
    const isValid = await validateBIP39Mnemonic(invalidWordMnemonic);
    assert(!isValid, 'Mnemonic with invalid words should be invalid');
  });

  await t.step('validateBIP39Mnemonic - invalid checksum', async () => {
    // This is a mnemonic with valid words but invalid checksum
    const invalidChecksumMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    const isValid = await validateBIP39Mnemonic(invalidChecksumMnemonic);
    assert(!isValid, 'Mnemonic with invalid checksum should be invalid');
  });

  await t.step('validateBIP39Mnemonic - custom wordlist', async () => {
    const customWordlist = Array.from(
      { length: 2048 },
      (_, i) => `word${i.toString().padStart(4, '0')}`,
    );

    // Generate a valid mnemonic with custom wordlist
    const result = await generateBIP39Mnemonic({
      wordCount: 12,
      wordlist: customWordlist,
    });

    // Validate with same custom wordlist
    const isValid = await validateBIP39Mnemonic(result.phrase, customWordlist);
    assert(isValid, 'Valid mnemonic should validate with custom wordlist');

    // Should fail with default wordlist
    const isValidDefault = await validateBIP39Mnemonic(result.phrase);
    assert(
      !isValidDefault,
      'Custom wordlist mnemonic should fail with default wordlist',
    );
  });

  await t.step('validateBIP39Mnemonic - malformed input', async () => {
    // Test with extra whitespace
    const mnemonicWithSpaces =
      '  abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   about  ';
    const isValid = await validateBIP39Mnemonic(mnemonicWithSpaces);
    assert(isValid, 'Mnemonic with extra whitespace should be valid');
  });

  await t.step('validateBIP39Mnemonic - exception handling', async () => {
    // Test empty string
    const isValid1 = await validateBIP39Mnemonic('');
    assert(!isValid1, 'Empty mnemonic should be invalid');

    // Test null-like input
    const isValid2 = await validateBIP39Mnemonic('   ');
    assert(!isValid2, 'Whitespace-only mnemonic should be invalid');
  });

  // Test alias functions
  await t.step('generateSeedPhrase - default 12 words', async () => {
    const result = await generateSeedPhrase();
    assertEquals(result.words.length, 12);
    assertEquals(result.seed.length, 64);
  });

  await t.step('generateSeedPhrase - with word count', async () => {
    const result = await generateSeedPhrase(24);
    assertEquals(result.words.length, 24);
    assertEquals(result.seed.length, 64);
  });

  await t.step('generateSeedPhrase - with passphrase', async () => {
    const result = await generateSeedPhrase(12, 'test passphrase');
    assertEquals(result.words.length, 12);
    assertEquals(result.seed.length, 64);
  });

  await t.step('validateSeedPhrase - alias functionality', async () => {
    const validMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const isValid = await validateSeedPhrase(validMnemonic);
    assert(isValid, 'validateSeedPhrase should work as alias');
  });

  // Test convenience functions with passphrase
  await t.step('generate12WordSeed - with passphrase', async () => {
    const seed = await generate12WordSeed('test passphrase');
    assertEquals(seed.words.length, 12);
    assertEquals(seed.seed.length, 64);
  });

  await t.step('generate24WordSeed - with passphrase', async () => {
    const seed = await generate24WordSeed('test passphrase');
    assertEquals(seed.words.length, 24);
    assertEquals(seed.seed.length, 64);
  });

  // Test mnemonicToSeed edge cases
  await t.step(
    'mnemonicToSeed - empty passphrase vs no passphrase',
    async () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const seed1 = await mnemonicToSeed(mnemonic);
      const seed2 = await mnemonicToSeed(mnemonic, '');

      // Should be identical
      for (let i = 0; i < seed1.length; i++) {
        assertEquals(
          seed1[i],
          seed2[i],
          'Empty passphrase should equal no passphrase',
        );
      }
    },
  );

  await t.step('mnemonicToSeed - unicode passphrase', async () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const unicodePassphrase = '测试密码🔑';

    const seed = await mnemonicToSeed(mnemonic, unicodePassphrase);
    assertEquals(seed.length, 64);

    // Should be reproducible
    const seed2 = await mnemonicToSeed(mnemonic, unicodePassphrase);
    for (let i = 0; i < seed.length; i++) {
      assertEquals(
        seed[i],
        seed2[i],
        'Unicode passphrase should be reproducible',
      );
    }
  });
});
