import { bench } from '@tundralibs/compat/bench';
import { cuid2 } from './mod.ts';

// Default length (24). Every character is drawn from crypto.getRandomValues,
// so this is the most random-draw-heavy generator in the package.
bench({
  name: `id.Generate cuid2 (default length 24)`,
}, () => {
  cuid2();
});

// Maximum supported length (32) — more per-character random draws.
bench({
  name: `id.Generate cuid2 of length 32`,
}, () => {
  cuid2(32);
});

// Batch generation — amortises the per-character random-draw cost.
bench({
  name: `id.Generate 100 cuid2 in a loop`,
}, () => {
  for (let i = 0; i < 100; i++) {
    cuid2();
  }
});
