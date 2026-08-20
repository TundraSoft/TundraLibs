import { bench } from '@tundralibs/compat/bench';
import { signHMAC, signRSA, verifyHMAC, verifyRSA } from './mod.ts';
console.log(
  await signHMAC('abcdefghijklmnopqrstuvwx', 'my data', {
    hashAlgorithm: 'SHA-1',
  }),
);
bench({
  name: 'crypt.Sign - HMAC:SHA-1',
  fn: async () => {
    await signHMAC('abcdefghijklmnopqrstuvwx', 'my data', {
      hashAlgorithm: 'SHA-1',
    });
  },
});

bench({
  name: 'crypt.Sign - HMAC:SHA-256',
  fn: async () => {
    await signHMAC('abcdefghijklmnopqrstuvwx', 'my data', {
      hashAlgorithm: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.Sign - HMAC:SHA-384',
  fn: async () => {
    await signHMAC('abcdefghijklmnopqrstuvwx', 'my data', {
      hashAlgorithm: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.Sign - HMAC:SHA-512',
  fn: async () => {
    await signHMAC('abcdefghijklmnopqrstuvwx', 'my data', {
      hashAlgorithm: 'SHA-512',
    });
  },
});

bench({
  name: 'crypt.Verify - HMAC:SHA-1',
  fn: async () => {
    await verifyHMAC(
      'my data',
      'cd02551761ed331daf90a78386a9613f19b55604',
      'abcdefghijklmnopqrstuvwx',
      { hashAlgorithm: 'SHA-1' },
    );
  },
});

bench({
  name: 'crypt.Verify - HMAC:SHA-256',
  fn: async () => {
    await verifyHMAC(
      'my data',
      '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
      'abcdefghijklmnopqrstuvwx',
      { hashAlgorithm: 'SHA-256' },
    );
  },
});

bench({
  name: 'crypt.Verify - HMAC:SHA-384',
  fn: async () => {
    await verifyHMAC(
      'my data',
      'f2e3560b29ee01dc41ad1c2f6da4d6334a5e40780bb2ebee9b73d15820646c5fa6af8ceec8e1913fb8c7223cba81b7ff',
      'abcdefghijklmnopqrstuvwx',
      { hashAlgorithm: 'SHA-384' },
    );
  },
});

bench({
  name: 'crypt.Verify - HMAC:SHA-512',
  fn: async () => {
    await verifyHMAC(
      'my data',
      '1d03df3605d4631e3094093e6886d1f151c2c39adb170cbe2c6747f0507ce59e44d68561faff01430310abb738b29479402bef6c4e3d604a4b4cb56bf4718a7c',
      'abcdefghijklmnopqrstuvwx',
      { hashAlgorithm: 'SHA-512' },
    );
  },
});

// RSA
const keyPair = await crypto.subtle.generateKey(
  {
    name: 'RSA-PSS',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);

// Export and format private key as PEM
const privateKeyRaw = await crypto.subtle.exportKey(
  'pkcs8',
  keyPair.privateKey,
);
const privateKeyBase64 = btoa(
  String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
);
const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
  privateKeyBase64.match(/.{1,64}/g)?.join('\n')
}\n-----END PRIVATE KEY-----`;

const publicKeyRaw = await crypto.subtle.exportKey(
  'spki',
  keyPair.publicKey,
);
const publicKeyBase64 = btoa(
  String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
);
const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
  publicKeyBase64.match(/.{1,64}/g)?.join('\n')
}\n-----END PUBLIC KEY-----`;

const signature256 = await signRSA('my data', privateKeyPEM, {
  hashAlgorithm: 'SHA-256',
});
const signature384 = await signRSA('my data', privateKeyPEM, {
  hashAlgorithm: 'SHA-384',
});
const signature512 = await signRSA('my data', privateKeyPEM, {
  hashAlgorithm: 'SHA-512',
});

bench({
  name: 'crypt.Sign - RSA-PSS:SHA-256',
  fn: async () => {
    await signRSA('my data', privateKeyPEM, {
      hashAlgorithm: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.Sign - RSA-PSS:SHA-256',
  fn: async () => {
    await signRSA('my data', privateKeyPEM, {
      hashAlgorithm: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.Sign - RSA-PSS:SHA-256',
  fn: async () => {
    await signRSA('my data', privateKeyPEM, {
      hashAlgorithm: 'SHA-512',
    });
  },
});

bench({
  name: 'crypt.Verify - RSA-PSS:SHA-256',
  fn: async () => {
    await verifyRSA('my data', signature256, publicKeyPEM, {
      hashAlgorithm: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.Verify - RSA-PSS:SHA-384',
  fn: async () => {
    await verifyRSA('my data', signature384, publicKeyPEM, {
      hashAlgorithm: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.Verify - RSA-PSS:SHA-512',
  fn: async () => {
    await verifyRSA('my data', signature512, publicKeyPEM, {
      hashAlgorithm: 'SHA-512',
    });
  },
});
