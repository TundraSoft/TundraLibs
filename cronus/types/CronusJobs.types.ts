// deno-lint-ignore no-explicit-any
type Callback = (...args: any[]) => unknown | Promise<unknown>;

export type CronusJob = {
  schedule: string;
  action: Callback;
  enable?: boolean;
  // deno-lint-ignore no-explicit-any
  arguments?: any[];
};
