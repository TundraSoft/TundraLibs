export type ExcludeNever<T> =
  { [K in keyof T as T[K] extends never ? never : K]: T[K] } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
