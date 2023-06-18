export type CronusEvents = {
  run(
    id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: unknown,
    error?: Error,
  ): void;
  start(id: string, name: string, time: Date): void;
  finish(id: string, name: string, timeTaken: number, output?: unknown): void;
  error(id: string, name: string, timeTaken: number, error: Error): void;
};
