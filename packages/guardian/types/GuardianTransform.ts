/**
 * Transform function type for Guardian validation library.
 *
 * @template I - Input type
 * @template O - Output type
 */
export type GuardianTransform<I, O> = (input: I) => O | Promise<O>;
