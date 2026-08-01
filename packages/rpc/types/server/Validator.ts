/**
 * Validator for an incoming command payload.
 *
 * Returns the validated value (which may differ in shape from the
 * raw input — e.g. a Guardian schema's parse output) or throws on
 * invalid input. The thrown error's `.message` is propagated to
 * the client in the result frame.
 *
 * @typeParam T - Type of the validated payload.
 */
export type Validator<T> = (input: unknown) => T | Promise<T>;
