import { bench } from '@tundralibs/compat/bench';
import { cuid } from './mod.ts';

// Single cuid (25 chars: c + timestamp + counter + fingerprint + random).
bench({
  name: `id.Generate cuid`,
}, () => {
  cuid();
});

// Batch generation — surfaces the per-call random-byte cost amortised over
// many IDs (the fingerprint is computed once, on the first call only).
bench({
  name: `id.Generate 100 cuids in a loop`,
}, () => {
  for (let i = 0; i < 100; i++) {
    cuid();
  }
});
