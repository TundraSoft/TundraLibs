// deno-lint-ignore no-explicit-any
export type Middleware = (...args: any) => any | Promise<any>;
