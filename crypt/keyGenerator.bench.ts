import { keyGenerator } from './mod.ts';

// Key generator
Deno.bench({
  name: `Generate key of length 10 characters`,
}, () => {
  keyGenerator(10);
});

Deno.bench({
  name: `Generate key of length 10 characters with prefix`,
}, () => {
  keyGenerator(10, 'TLIB-');
});

Deno.bench({
  name: `Generate key of length 16 characters`,
}, () => {
  keyGenerator(16);
});

Deno.bench({
  name: `Generate key of length 16 characters with prefix`,
}, () => {
  keyGenerator(16, 'TLIB-');
});

Deno.bench({
  name: `Generate key of length 32 characters`,
}, () => {
  keyGenerator(32);
});

Deno.bench({
  name: `Generate key of length 32 characters with prefix`,
}, () => {
  keyGenerator(32, 'TLIB-');
});
