export type CronusEvents = {
  run(
    id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: unknown,
    error?: Error,
  ): void;
  start(id: string, name: string, start: Date): void;
  success(
    id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: unknown,
  ): void;
  error(
    id: string,
    name: string,
    start: Date,
    timeTaken: number,
    error: Error,
  ): void;
};
