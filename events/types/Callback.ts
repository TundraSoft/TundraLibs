/**
 * Event Callback definition. It can accept any number of arguments and
 * return any value.
 */
// deno-lint-ignore no-explicit-any
export type Callback = (...args: any[]) => any | Promise<any>;

export type Listeners = Callback & { __once?: true };
