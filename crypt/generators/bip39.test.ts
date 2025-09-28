import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  BIP39_ENGLISH_WORDLIST,
  generate12WordSeed,
  generate24WordSeed,
  generateBIP39Mnemonic,
  mnemonicToSeed,
  validateBIP39Mnemonic,
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
});
