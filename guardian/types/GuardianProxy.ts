import type { FunctionType } from './Function.ts';

export type GuardianProxy<
  V extends { guardian: FunctionType },
  F extends FunctionType = V['guardian'],
> = Omit<V, 'guardian' | 'proxy'> & { guardian: F } & F;
