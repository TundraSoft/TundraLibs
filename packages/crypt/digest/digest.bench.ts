import { digest } from './mod.ts';

Deno.bench({
  name: 'crypt.Digest - SHA-1',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-1' });
  },
});

Deno.bench({
  name: 'crypt.Digest - SHA-256',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-256' });
  },
});

Deno.bench({
  name: 'crypt.Digest - SHA-384',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-384' });
  },
});

Deno.bench({
  name: 'crypt.Digest - SHA-512',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-512' });
  },
});
