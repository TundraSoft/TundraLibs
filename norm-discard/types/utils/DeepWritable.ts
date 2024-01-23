export type DeepWritable<T> =
  { -readonly [P in keyof T]: DeepWritable<T[P]> } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
