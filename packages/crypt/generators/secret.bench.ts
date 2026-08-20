import { bench } from '@tundralibs/compat/bench';
import { secretGenerator } from './secret.ts';

// Benchmark different byte lengths
bench({
  name: 'crypt.generators.secret 16-byte secret (hex)',
  fn: () => {
    secretGenerator(16);
  },
});

bench({
  name: 'crypt.generators.secret 32-byte secret (hex)',
  fn: () => {
    secretGenerator(32);
  },
});

bench({
  name: 'crypt.generators.secret 64-byte secret (hex)',
  fn: () => {
    secretGenerator(64);
  },
});

// Benchmark different encodings
bench({
  name: 'crypt.generators.secret 32-byte secret (base64)',
  fn: () => {
    secretGenerator(32, 'BASE64');
  },
});

bench({
  name: 'crypt.generators.secret 32-byte secret (base32)',
  fn: () => {
    secretGenerator(32, 'BASE32');
  },
});

bench({
  name: 'crypt.generators.secret 32-byte secret (alphanumeric)',
  fn: () => {
    secretGenerator(32, 'ALPHANUMERIC');
  },
});

// Benchmark with options object
bench({
  name: 'crypt.generators.secret 32-byte secret with options object',
  fn: () => {
    secretGenerator({
      byteLength: 32,
      encoding: 'HEX',
    });
  },
});
