import { bench } from '@tundralibs/compat/bench';
import { decryptAES, decryptRSA, encryptAES, encryptRSA } from './mod.ts';
import { generateKeyPair } from '../generators/mod.ts';

bench({
  name: 'crypt.Encrypt - AES-GCM:128',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'GCM',
      keyLength: 128,
    });
  },
});

bench({
  name: 'crypt.Encrypt - AES-GCM:256',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'GCM',
      keyLength: 256,
    });
  },
});

bench({
  name: 'crypt.Encrypt - AES-CBC:128',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'CBC',
      keyLength: 128,
    });
  },
});

bench({
  name: 'crypt.Encrypt - AES-CBC:256',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'CBC',
      keyLength: 256,
    });
  },
});

// Decrypt — fixtures are generated at setup (same pattern as the RSA
// section below): hardcoded envelopes rot the moment the wire format
// changes, which is exactly how this file's originals broke (2-part
// `data:iv` relics of a pre-salt format).
const AES_KEY = 'abcdefghijklmnopqrstuvwx';
const gcm128 = await encryptAES('hello world', AES_KEY, {
  mode: 'GCM',
  keyLength: 128,
});
const gcm256 = await encryptAES('hello world', AES_KEY, {
  mode: 'GCM',
  keyLength: 256,
});
const cbc128 = await encryptAES('hello world', AES_KEY, {
  mode: 'CBC',
  keyLength: 128,
});
const cbc256 = await encryptAES('hello world', AES_KEY, {
  mode: 'CBC',
  keyLength: 256,
});

bench({
  name: 'crypt.Decrypt - AES-GCM:128',
  fn: async () => {
    await decryptAES(gcm128, AES_KEY, { mode: 'GCM', keyLength: 128 });
  },
});

bench({
  name: 'crypt.Decrypt - AES-GCM:256',
  fn: async () => {
    await decryptAES(gcm256, AES_KEY, { mode: 'GCM', keyLength: 256 });
  },
});

bench({
  name: 'crypt.Decrypt - AES-CBC:128',
  fn: async () => {
    await decryptAES(cbc128, AES_KEY, { mode: 'CBC', keyLength: 128 });
  },
});

bench({
  name: 'crypt.Decrypt - AES-CBC:256',
  fn: async () => {
    await decryptAES(cbc256, AES_KEY, { mode: 'CBC', keyLength: 256 });
  },
});

// RSA
const keyPair = await generateKeyPair('RSA-OAEP', 'PEM');
const encryptedSha1 = await encryptRSA(
  'hello world',
  keyPair.publicKeyExported as string,
  { hashAlgorithm: 'SHA-1' },
);
const encryptedSha256 = await encryptRSA(
  'hello world',
  keyPair.publicKeyExported as string,
  { hashAlgorithm: 'SHA-256' },
);
const encryptedSha384 = await encryptRSA(
  'hello world',
  keyPair.publicKeyExported as string,
  { hashAlgorithm: 'SHA-384' },
);
const encryptedSha512 = await encryptRSA(
  'hello world',
  keyPair.publicKeyExported as string,
  { hashAlgorithm: 'SHA-512' },
);
bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-1)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-1',
    });
  },
});

bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-256)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-384)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-512)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-512',
    });
  },
});

bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-1)',
  fn: async () => {
    await decryptRSA(encryptedSha1, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-1',
    });
  },
});

bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-256)',
  fn: async () => {
    await decryptRSA(encryptedSha256, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-384)',
  fn: async () => {
    await decryptRSA(encryptedSha384, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-512)',
  fn: async () => {
    await decryptRSA(encryptedSha512, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-512',
    });
  },
});
