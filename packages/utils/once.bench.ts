import { once } from './once.ts';

// Baseline plain function
const plainFn = (a: number, b: number) => a + b;
const onceFn = once((a: number, b: number) => a + b);
// Prime once function (first invocation performs real work)
onceFn(1, 2);

Deno.bench({
  name: 'utils.once - plain function call',
}, () => {
  plainFn(10, 20);
});

Deno.bench({
  name: 'utils.once - first invocation cost',
}, () => {
  // Create fresh once wrapper each iteration to measure initial overhead
  const local = once((x: number) => x * 2);
  local(5);
});

Deno.bench({
  name: 'utils.once - cached invocation cost',
}, () => {
  // Subsequent calls should be minimal overhead
  onceFn(10, 20);
});
