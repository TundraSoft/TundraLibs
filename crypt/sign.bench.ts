import { sign, verify } from './mod.ts';

Deno.bench({
  name: 'sign - HMAC:SHA-1',
  fn: async () => {
    await sign('HMAC:SHA-1', 'abcdefghijklmnopqrstuvwx', 'my data');
  },
});

Deno.bench({
  name: 'sign - HMAC:SHA-256',
  fn: async () => {
    await sign('HMAC:SHA-256', 'abcdefghijklmnopqrstuvwx', 'my data');
  },
});

Deno.bench({
  name: 'sign - HMAC:SHA-384',
  fn: async () => {
    await sign('HMAC:SHA-384', 'abcdefghijklmnopqrstuvwx', 'my data');
  },
});

Deno.bench({
  name: 'sign - HMAC:SHA-512',
  fn: async () => {
    await sign('HMAC:SHA-512', 'abcdefghijklmnopqrstuvwx', 'my data');
  },
});

Deno.bench({
  name: 'verify - HMAC:SHA-1',
  fn: async () => {
    await verify(
      'HMAC:SHA-1',
      'abcdefghijklmnopqrstuvwx',
      'my data',
      'cd02551761ed331daf90a78386a9613f19b55604',
    );
  },
});

Deno.bench({
  name: 'verify - HMAC:SHA-256',
  fn: async () => {
    await verify(
      'HMAC:SHA-1',
      'abcdefghijklmnopqrstuvwx',
      'my data',
      '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
    );
  },
});

Deno.bench({
  name: 'verify - HMAC:SHA-384',
  fn: async () => {
    await verify(
      'HMAC:SHA-1',
      'abcdefghijklmnopqrstuvwx',
      'my data',
      'f2e3560b29ee01dc41ad1c2f6da4d6334a5e40780bb2ebee9b73d15820646c5fa6af8ceec8e1913fb8c7223cba81b7ff',
    );
  },
});

Deno.bench({
  name: 'verify - HMAC:SHA-512',
  fn: async () => {
    await verify(
      'HMAC:SHA-512',
      'abcdefghijklmnopqrstuvwx',
      'my data',
      '1d03df3605d4631e3094093e6886d1f151c2c39adb170cbe2c6747f0507ce59e44d68561faff01430310abb738b29479402bef6c4e3d604a4b4cb56bf4718a7c',
    );
  },
});
