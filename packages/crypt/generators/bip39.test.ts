import { assert, assertEquals, assertRejects } from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
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

describe('crypt.generators.bip39', () => {
  it('BIP39_ENGLISH_WORDLIST - basic properties', () => {
    assertEquals(BIP39_ENGLISH_WORDLIST.length, 2048);
    assertEquals(typeof BIP39_ENGLISH_WORDLIST[0], 'string');
    assertEquals(BIP39_ENGLISH_WORDLIST[0], 'abandon');
    assertEquals(BIP39_ENGLISH_WORDLIST[2047], 'zoo');
  });

  it('generateBIP39Mnemonic - 12 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 12 });
    assertEquals(result.words.length, 12);
    assertEquals(result.phrase.split(' ').length, 12);
    assertEquals(result.entropy.length, 16); // 128 bits = 16 bytes
    assertEquals(result.seed.length, 64); // 512 bits = 64 bytes
  });

  it('generateBIP39Mnemonic - 24 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 24 });
    assertEquals(result.words.length, 24);
    assertEquals(result.phrase.split(' ').length, 24);
    assertEquals(result.entropy.length, 32); // 256 bits = 32 bytes
    assertEquals(result.seed.length, 64); // 512 bits = 64 bytes
  });

  it('validateBIP39Mnemonic - valid mnemonic', async () => {
    const validMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const isValid = await validateBIP39Mnemonic(validMnemonic);
    assert(isValid, 'Known valid mnemonic should be valid');
  });

  it('validateBIP39Mnemonic - invalid mnemonic', async () => {
    const invalidMnemonic = 'invalid word list that does not match bip39';
    const isValid = await validateBIP39Mnemonic(invalidMnemonic);
    assert(!isValid, 'Invalid mnemonic should be invalid');
  });

  it('mnemonicToSeed - consistent output', async () => {
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

  it('generate12WordSeed - basic functionality', async () => {
    const seed = await generate12WordSeed();
    const words = seed.phrase.split(' ');
    assertEquals(words.length, 12);
    assertEquals(seed.seed.length, 64);
  });

  it('generate24WordSeed - basic functionality', async () => {
    const seed = await generate24WordSeed();
    const words = seed.phrase.split(' ');
    assertEquals(words.length, 24);
    assertEquals(seed.seed.length, 64);
  });

  // Test all supported word counts
  it('generateBIP39Mnemonic - 15 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 15 });
    assertEquals(result.words.length, 15);
    assertEquals(result.phrase.split(' ').length, 15);
    assertEquals(result.entropy.length, 20); // 160 bits = 20 bytes
    assertEquals(result.seed.length, 64);
  });

  it('generateBIP39Mnemonic - 18 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 18 });
    assertEquals(result.words.length, 18);
    assertEquals(result.phrase.split(' ').length, 18);
    assertEquals(result.entropy.length, 24); // 192 bits = 24 bytes
    assertEquals(result.seed.length, 64);
  });

  it('generateBIP39Mnemonic - 21 words', async () => {
    const result = await generateBIP39Mnemonic({ wordCount: 21 });
    assertEquals(result.words.length, 21);
    assertEquals(result.phrase.split(' ').length, 21);
    assertEquals(result.entropy.length, 28); // 224 bits = 28 bytes
    assertEquals(result.seed.length, 64);
  });

  // Test passphrase functionality
  it('generateBIP39Mnemonic - with passphrase', async () => {
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
  it('generateBIP39Mnemonic - custom wordlist', async () => {
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
  it(
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

  it(
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

  it('generateBIP39Mnemonic - invalid word count', async () => {
    await assertRejects(
      // @ts-expect-error Testing invalid input
      () => generateBIP39Mnemonic({ wordCount: 13 }),
      Error,
      'Word count must be 12, 15, 18, 21, or 24',
    );

    await assertRejects(
      // @ts-expect-error Testing invalid input
      () => generateBIP39Mnemonic({ wordCount: 10 }),
      Error,
      'Word count must be 12, 15, 18, 21, or 24',
    );
  });

  // Validation edge cases
  it(
    'validateBIP39Mnemonic - invalid word count (too short)',
    async () => {
      const shortMnemonic = 'abandon abandon abandon';
      const isValid = await validateBIP39Mnemonic(shortMnemonic);
      assert(!isValid, 'Short mnemonic should be invalid');
    },
  );

  it(
    'validateBIP39Mnemonic - invalid word count (too long)',
    async () => {
      const longMnemonic = Array.from({ length: 30 }, () => 'abandon').join(
        ' ',
      );
      const isValid = await validateBIP39Mnemonic(longMnemonic);
      assert(!isValid, 'Long mnemonic should be invalid');
    },
  );

  it('validateBIP39Mnemonic - words not in wordlist', async () => {
    const invalidWordMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon invalidword';
    const isValid = await validateBIP39Mnemonic(invalidWordMnemonic);
    assert(!isValid, 'Mnemonic with invalid words should be invalid');
  });

  it('validateBIP39Mnemonic - invalid checksum', async () => {
    // This is a mnemonic with valid words but invalid checksum
    const invalidChecksumMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    const isValid = await validateBIP39Mnemonic(invalidChecksumMnemonic);
    assert(!isValid, 'Mnemonic with invalid checksum should be invalid');
  });

  it('validateBIP39Mnemonic - custom wordlist', async () => {
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

  it('validateBIP39Mnemonic - malformed input', async () => {
    // Test with extra whitespace
    const mnemonicWithSpaces =
      '  abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   abandon   about  ';
    const isValid = await validateBIP39Mnemonic(mnemonicWithSpaces);
    assert(isValid, 'Mnemonic with extra whitespace should be valid');
  });

  it('validateBIP39Mnemonic - exception handling', async () => {
    // Test empty string
    const isValid1 = await validateBIP39Mnemonic('');
    assert(!isValid1, 'Empty mnemonic should be invalid');

    // Test null-like input
    const isValid2 = await validateBIP39Mnemonic('   ');
    assert(!isValid2, 'Whitespace-only mnemonic should be invalid');
  });

  // Test alias functions
  it('generateSeedPhrase - default 12 words', async () => {
    const result = await generateSeedPhrase();
    assertEquals(result.words.length, 12);
    assertEquals(result.seed.length, 64);
  });

  it('generateSeedPhrase - with word count', async () => {
    const result = await generateSeedPhrase(24);
    assertEquals(result.words.length, 24);
    assertEquals(result.seed.length, 64);
  });

  it('generateSeedPhrase - with passphrase', async () => {
    const result = await generateSeedPhrase(12, 'test passphrase');
    assertEquals(result.words.length, 12);
    assertEquals(result.seed.length, 64);
  });

  it('validateSeedPhrase - alias functionality', async () => {
    const validMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const isValid = await validateSeedPhrase(validMnemonic);
    assert(isValid, 'validateSeedPhrase should work as alias');
  });

  // Test convenience functions with passphrase
  it('generate12WordSeed - with passphrase', async () => {
    const seed = await generate12WordSeed('test passphrase');
    assertEquals(seed.words.length, 12);
    assertEquals(seed.seed.length, 64);
  });

  it('generate24WordSeed - with passphrase', async () => {
    const seed = await generate24WordSeed('test passphrase');
    assertEquals(seed.words.length, 24);
    assertEquals(seed.seed.length, 64);
  });

  // Test mnemonicToSeed edge cases
  it(
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

  it('mnemonicToSeed - unicode passphrase', async () => {
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

  // ---- BIP39 NFKD normalization (spec compliance, cross-wallet seeds) ----

  // Official BIP39 Japanese test vector (bip32JP/bip32JP.github.io,
  // test_JP_BIP39.json, vector 0). It is the canonical exercise of NFKD
  // normalization: the mnemonic separates words with the ideographic space
  // U+3000 (which NFKD folds to U+0020) and the passphrase carries
  // compatibility characters such as ㍍ (U+3350 → メートル). Without
  // NFKD-normalizing BOTH inputs the derived seed does not equal this
  // published value, so a wallet restoring the same words elsewhere would get
  // different keys.
  it('mnemonicToSeed - matches BIP39 Japanese vector (NFKD)', async () => {
    const mnemonic =
      'あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あおぞら';
    const passphrase = '㍍ガバヴァぱばぐゞちぢ十人十色';
    const expected =
      'a262d6fb6122ecf45be09c50492b31f92e9beb7d9a845987a02cefda57a15f9c467a17872029a9e92299b5cbdf306e3a0ee620245cbd508959b6cb7ca637bd55';

    const seed = await mnemonicToSeed(mnemonic, passphrase);
    const hex = Array.from(seed)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    assertEquals(hex, expected);
  });

  // A passphrase written in composed (NFC) and decomposed (NFD) form is the
  // same text and MUST derive the same seed once NFKD-normalized. Before the
  // fix the raw bytes differed and produced two different seeds.
  it('mnemonicToSeed - composed vs decomposed passphrase agree', async () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const nfc = 'café'.normalize('NFC'); // 'caf' + U+00E9
    const nfd = 'café'.normalize('NFD'); // 'caf' + 'e' + U+0301
    assert(nfc !== nfd, 'precondition: the two encodings differ byte-for-byte');

    const seedNfc = await mnemonicToSeed(mnemonic, nfc);
    const seedNfd = await mnemonicToSeed(mnemonic, nfd);
    assertEquals(seedNfc, seedNfd);
  });

  // The same must hold for the mnemonic sentence itself.
  it('mnemonicToSeed - composed vs decomposed mnemonic agree', async () => {
    const nfc = 'àbàndon'.normalize('NFC'); // à = U+00E0
    const nfd = 'àbàndon'.normalize('NFD'); // a + U+0300
    assert(nfc !== nfd, 'precondition: the two encodings differ byte-for-byte');

    const seedNfc = await mnemonicToSeed(nfc, '');
    const seedNfd = await mnemonicToSeed(nfd, '');
    assertEquals(seedNfc, seedNfd);
  });

  // The NFKD fix in commit 6f81226 reached mnemonicToSeed but stopped short of
  // validateBIP39Mnemonic (and its mnemonicToEntropy checksum path), which
  // still compared raw words with `wordlist.indexOf`. The two sibling entry
  // points therefore disagreed about the same input: a mnemonic carrying
  // compatibility characters (an IME's full-width Latin, or NFC kana against
  // the official NFKD Japanese wordlist) was rejected as INVALID, while
  // mnemonicToSeed one function away derived the correct published seed.
  it('validateBIP39Mnemonic - NFKD-folds compatibility characters (agrees with mnemonicToSeed)', async () => {
    const ascii =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    // Full-width Latin (U+FF41 'ａ' … U+FF5A 'ｚ'), which some IMEs emit. NFKD
    // folds each code point back to ASCII, so this is the SAME mnemonic in a
    // non-canonical form.
    const fullWidth = ascii.replace(
      /[a-z]/g,
      (c) => String.fromCodePoint(c.codePointAt(0)! - 0x61 + 0xff41),
    );
    assert(fullWidth !== ascii, 'precondition: encodings differ byte-for-byte');

    assert(
      await validateBIP39Mnemonic(ascii),
      'ASCII form is a valid mnemonic',
    );
    assert(
      await validateBIP39Mnemonic(fullWidth),
      'NFKD-equivalent mnemonic must validate',
    );

    // Both forms derive the byte-identical seed — the two entry points now
    // agree about the same input.
    assertEquals(await mnemonicToSeed(fullWidth), await mnemonicToSeed(ascii));
  });

  // BIP39 compares in NFKD on BOTH sides. Official non-English wordlists ship
  // in NFKD while user input often arrives NFC/NFD, so validation must fold the
  // wordlist too, not just the input.
  it('validateBIP39Mnemonic - NFKD-folds a non-ASCII custom wordlist on both sides', async () => {
    const wordlist = Array.from(
      { length: 2048 },
      (_, i) => `wörd${i.toString().padStart(4, '0')}`.normalize('NFC'), // ö = U+00F6
    );
    const { phrase } = await generateBIP39Mnemonic({ wordCount: 12, wordlist });

    // Present the (NFC) generated phrase decomposed, as a different input
    // method might.
    const decomposed = phrase.normalize('NFD');
    assert(
      decomposed !== phrase,
      'precondition: encodings differ byte-for-byte',
    );

    assert(
      await validateBIP39Mnemonic(decomposed, wordlist),
      'NFD input must validate against the NFC wordlist',
    );
  });
});
