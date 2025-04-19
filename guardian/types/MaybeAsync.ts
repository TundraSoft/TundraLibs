export type MaybeAsync<T, V> = T extends PromiseLike<unknown> ? PromiseLike<V>
  : V;
