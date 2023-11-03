type CronusCallback = (...args: unknown[]) => unknown | Promise<unknown>;

export type CronusJob = {
  schedule: string;
  action: CronusCallback;
  enable?: boolean;
  arguments?: unknown[];
};
