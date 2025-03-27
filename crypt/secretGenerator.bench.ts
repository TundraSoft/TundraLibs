import { secretGenerator } from './mod.ts';

// Benchmark different byte lengths
Deno.bench({
  name: 'Generate 16-byte secret (hex)',
  fn: () => {
    secretGenerator(16);
  },
});

Deno.bench({
  name: 'Generate 32-byte secret (hex)',
  fn: () => {
    secretGenerator(32);
  },
});

Deno.bench({
  name: 'Generate 64-byte secret (hex)',
  fn: () => {
    secretGenerator(64);
  },
});

// Benchmark different encodings
Deno.bench({
  name: 'Generate 32-byte secret (base64)',
  fn: () => {
    secretGenerator(32, 'base64');
  },
});

Deno.bench({
  name: 'Generate 32-byte secret (raw)',
  fn: () => {
    secretGenerator(32, 'raw');
  },
});

// New benchmark for alphanumeric encoding
Deno.bench({
  name: 'Generate 32-byte secret (alphanumeric)',
  fn: () => {
    secretGenerator(32, 'alphanumeric');
  },
});

// Benchmark with prefix
Deno.bench({
  name: 'Generate 32-byte secret with prefix',
  fn: () => {
    secretGenerator(32, 'hex', 'prefix:');
  },
});

// Benchmark with hyphen interval
Deno.bench({
  name: 'Generate 32-byte secret with hyphen interval',
  fn: () => {
    secretGenerator(32, 'hex', '', 4);
  },
});

// Benchmark with lowercase option
Deno.bench({
  name: 'Generate 32-byte secret with lowercase option',
  fn: () => {
    secretGenerator({
      byteLength: 32,
      encoding: 'hex',
      lowercase: true,
    });
  },
});

// Benchmark with combined options
Deno.bench({
  name: 'Generate 32-byte secret with all formatting options',
  fn: () => {
    secretGenerator({
      byteLength: 32,
      encoding: 'alphanumeric',
      prefix: 'key-',
      hyphenInterval: 4,
      lowercase: true,
    });
  },
});
