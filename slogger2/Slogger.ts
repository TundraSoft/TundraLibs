export class Slogger {
  create(
    name: string,
    opt: {
      handlers?: Record<string, unknown>;
      formatters?: Record<string, unknown>;
    },
  ) {}

  handler(name: string, handler: unknown) {}

  formatter(name: string, handler: unknown) {}
}
