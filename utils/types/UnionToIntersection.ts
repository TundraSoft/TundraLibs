/**
 * Converts a union type to an intersection type.
 *
 * @template U - The union type to convert.
 * @returns The intersection type derived from the union type.
 */
export type UnionToIntersection<U> =
  (U extends Record<string, unknown> ? (k: U) => void
    : never) extends ((k: infer I) => void)
    ? I extends infer O ? { [D in keyof O]: O[D] } : never
    : never;
