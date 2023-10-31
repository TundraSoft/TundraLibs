export type FunctionParameters = unknown[];

// deno-lint-ignore no-explicit-any
export type FunctionType<R = any, P extends FunctionParameters = any[]> = (
  ...args: P
) => R;

export type MergeParameters<P extends FunctionParameters> = [P] extends [
  never,
] ? [never]
  : [P] extends [[]] ? []
  : [P] extends [[unknown]] ? [P[0]]
  : [P] extends [[unknown?]] ? [P[0]?]
  : P;

// do not escape T to [T] to support `number | Promise<string>`
export type ResolvedValue<T> = T extends PromiseLike<infer R> ? R : T;

// deno-lint-ignore no-explicit-any
export type RemoveAsync<T> = T extends PromiseLike<any> ? never : T;

export type IsAsync<S> = ResolvedValue<S> extends S
  ? unknown extends S ? unknown
  : false
  : RemoveAsync<S> extends never ? true
  : unknown;

export type MaybeAsync<T, V> = unknown extends IsAsync<T> ? PromiseLike<V> | V
  : true extends IsAsync<T> ? PromiseLike<V>
  : V;
