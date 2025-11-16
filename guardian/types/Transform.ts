/**
 * Transform function type for Guardian validation library.
 *
 * @template I - Input type
 * @template O - Output type
 *
 * @since 1.0.0
 */
export type GuardianTransform<I, O> = (input: I) => O | Promise<O>;
