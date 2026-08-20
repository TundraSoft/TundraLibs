import { bench } from '@tundralibs/compat/bench';
import { digest } from './mod.ts';

bench({
  name: 'crypt.Digest - SHA-1',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-1' });
  },
});

bench({
  name: 'crypt.Digest - SHA-256',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-256' });
  },
});

bench({
  name: 'crypt.Digest - SHA-384',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-384' });
  },
});

bench({
  name: 'crypt.Digest - SHA-512',
  fn: async () => {
    await digest('hello world', { algorithm: 'SHA-512' });
  },
});
