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

// Benchmark with prefix
Deno.bench({
  name: 'Generate 32-byte secret with prefix',
  fn: () => {
    secretGenerator(32, 'hex', 'prefix:');
  },
});
