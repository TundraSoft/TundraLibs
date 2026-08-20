import { bench } from '@tundralibs/compat/bench';
import { getTimestamp, monotonicUlid, ulid } from './ulid.ts';

// Standard ULID generation
bench({
  name: 'id.Generate standard ULID',
}, () => {
  ulid();
});

// ULID with custom timestamp
bench({
  name: 'id.Generate - ULID with custom timestamp',
}, () => {
  ulid(1628000000000);
});

// Monotonic ULID generation
bench({
  name: 'id.Generate monotonic ULID',
}, () => {
  monotonicUlid();
});

// Benchmark batch generation
bench({
  name: 'id.Generate 100 ULIDs in a loop',
}, () => {
  for (let i = 0; i < 100; i++) {
    ulid();
  }
});

// Benchmark batch monotonic generation (same timestamp)
bench({
  name: 'id.Generate 100 monotonic ULIDs with the same timestamp',
}, () => {
  const timestamp = Date.now();
  for (let i = 0; i < 100; i++) {
    monotonicUlid(timestamp);
  }
});

// Timestamp extraction
bench({
  name: 'id.Extract timestamp from ULID',
}, () => {
  getTimestamp(ulid());
});
