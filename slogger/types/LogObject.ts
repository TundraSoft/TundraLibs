export type LogObject = {
  readonly appName: string;
  readonly severity: number;
  readonly timestamp: Date;
  readonly message: string;
  readonly params?: Record<string, unknown>;
};
