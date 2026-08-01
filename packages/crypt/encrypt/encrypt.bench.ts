/// <reference lib="Deno.ns" />

import { decryptAES, decryptRSA, encryptAES, encryptRSA } from './mod.ts';
import { generateKeyPair } from '../generators/mod.ts';

Deno.bench({
  name: 'crypt.Encrypt - AES-GCM:128',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'GCM',
      keyLength: 128,
    });
  },
});

Deno.bench({
  name: 'crypt.Encrypt - AES-GCM:256',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'GCM',
      keyLength: 256,
    });
  },
});

Deno.bench({
  name: 'crypt.Encrypt - AES-CBC:128',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'CBC',
      keyLength: 128,
    });
  },
});

Deno.bench({
  name: 'crypt.Encrypt - AES-CBC:256',
  fn: async () => {
    await encryptAES('hello world', 'abcdefghijklmnopqrstuvwx', {
      mode: 'CBC',
      keyLength: 256,
    });
  },
});

// Decrypt
Deno.bench({
  name: 'crypt.Decrypt - AES-GCM:128',
  fn: async () => {
    await decryptAES(
      '99fe5cec958dc5f4a8f79910cf064b05678be722bb8ca80a00623e:e98058e8453d8cec10dfda29b22c2998',
      'abcdefghijklmnopqrstuvwx',
      { mode: 'GCM', keyLength: 128 },
    );
  },
});

Deno.bench({
  name: 'crypt.Decrypt - AES-GCM:256',
  fn: async () => {
    await decryptAES(
      '64473c33bd19821c5ef1c16954b28e9300d29b8a8ecbf47eb695a0:31bdae3a603a976ecd2806a0af4dbdfa',
      'abcdefghijklmnopqrstuvwx',
      { mode: 'GCM', keyLength: 256 },
    );
  },
});

Deno.bench({
  name: 'crypt.Decrypt - AES-CBC:128',
  fn: async () => {
    await decryptAES(
      'c8929a8e5244807982247fc42c53bc00:10f3bc4d873641d79b2404c5de8e6f85',
      'abcdefghijklmnopqrstuvwx',
      { mode: 'CBC', keyLength: 128 },
    );
  },
});

Deno.bench({
  name: 'crypt.Decrypt - AES-CBC:256',
  fn: async () => {
    await decryptAES(
      'bd97807d0eb1dec401cd76983760151a:c4bb82a712cfca0320f4f16ff8714d9e',
      'abcdefghijklmnopqrstuvwx',
      { mode: 'CBC', keyLength: 256 },
    );
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
Deno.bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-1)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-1',
    });
  },
});

Deno.bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-256)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-256',
    });
  },
});

Deno.bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-384)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-384',
    });
  },
});

Deno.bench({
  name: 'crypt.Encrypt - RSA:2048 (SHA-512)',
  fn: async () => {
    await encryptRSA('hello world', keyPair.publicKeyExported as string, {
      hashAlgorithm: 'SHA-512',
    });
  },
});

Deno.bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-1)',
  fn: async () => {
    await decryptRSA(encryptedSha1, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-1',
    });
  },
});

Deno.bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-256)',
  fn: async () => {
    await decryptRSA(encryptedSha256, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-256',
    });
  },
});

Deno.bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-384)',
  fn: async () => {
    await decryptRSA(encryptedSha384, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-384',
    });
  },
});

Deno.bench({
  name: 'crypt.Decrypt - RSA:2048 (SHA-512)',
  fn: async () => {
    await decryptRSA(encryptedSha512, keyPair.privateKeyExported as string, {
      hashAlgorithm: 'SHA-512',
    });
  },
});
