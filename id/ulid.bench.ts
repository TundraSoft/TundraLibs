import { getTimestamp, monotonicUlid, ulid } from './ulid.ts';

// Standard ULID generation
Deno.bench({
  name: 'Generate standard ULID',
}, () => {
  ulid();
});

// ULID with custom timestamp
Deno.bench({
  name: 'Generate ULID with custom timestamp',
}, () => {
  ulid(1628000000000);
});

// Monotonic ULID generation
Deno.bench({
  name: 'Generate monotonic ULID',
}, () => {
  monotonicUlid();
});

// Benchmark batch generation
Deno.bench({
  name: 'Generate 100 ULIDs in a loop',
}, () => {
  for (let i = 0; i < 100; i++) {
    ulid();
  }
});

// Benchmark batch monotonic generation (same timestamp)
Deno.bench({
  name: 'Generate 100 monotonic ULIDs with the same timestamp',
}, () => {
  const timestamp = Date.now();
  for (let i = 0; i < 100; i++) {
    monotonicUlid(timestamp);
  }
});

// Timestamp extraction
Deno.bench({
  name: 'Extract timestamp from ULID',
}, () => {
  getTimestamp(ulid());
});
