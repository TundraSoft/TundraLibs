import { secretGenerator } from './secret.ts';

// Benchmark different byte lengths
Deno.bench({
  name: 'crypt.generators.secret 16-byte secret (hex)',
  fn: () => {
    secretGenerator(16);
  },
});

Deno.bench({
  name: 'crypt.generators.secret 32-byte secret (hex)',
  fn: () => {
    secretGenerator(32);
  },
});

Deno.bench({
  name: 'crypt.generators.secret 64-byte secret (hex)',
  fn: () => {
    secretGenerator(64);
  },
});

// Benchmark different encodings
Deno.bench({
  name: 'crypt.generators.secret 32-byte secret (base64)',
  fn: () => {
    secretGenerator(32, 'BASE64');
  },
});

// New benchmark for alphanumeric encoding
Deno.bench({
  name: 'crypt.generators.secret 32-byte secret (alphanumeric)',
  fn: () => {
    secretGenerator(32, 'ALPHANUMERIC');
  },
});

// Benchmark with prefix
Deno.bench({
  name: 'crypt.generators.secret 32-byte secret with prefix',
  fn: () => {
    secretGenerator(32, 'HEX', 'prefix:');
  },
});

// Benchmark with hyphen interval
Deno.bench({
  name: 'crypt.generators.secret 32-byte secret with hyphen interval',
  fn: () => {
    secretGenerator(32, 'HEX', '', 4);
  },
});

// Benchmark with lowercase option
Deno.bench({
  name: 'crypt.generators.secret 32-byte secret with lowercase option',
  fn: () => {
    secretGenerator({
      byteLength: 32,
      encoding: 'HEX',
      lowercase: true,
    });
  },
});

// Benchmark with combined options
Deno.bench({
  name: 'crypt.generators.secret 32-byte secret with all formatting options',
  fn: () => {
    secretGenerator({
      byteLength: 32,
      encoding: 'ALPHANUMERIC',
      prefix: 'key-',
      hyphenInterval: 4,
      lowercase: true,
    });
  },
});
