export type ResolvedValue<T> = T extends PromiseLike<infer R> ? R : T;
