export class BaseError extends Error {
  public readonly name: string;
  public readonly timeStamp: Date = new Date();
  declare public readonly meta: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    message: string,
    meta: Record<string, unknown> = {},
    cause: Error | undefined = undefined,
  ) {
    super(message.replace(/\$\{(\w+)\}/g, (_, key) => String(meta[key])));
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.meta = meta;
    this.cause = cause;
  }

  getMeta(key: string): unknown | undefined {
    return this.meta[key];
  }

  // protected makeMessage(message: string) {
  //   const metaString = this.meta ? Object.entries(this.meta).map(([key, value]) => `${key}=${value}`).join(' ') : '';
  //   return metaString ? `[${metaString}] ${message}` : message;
  // }

  toString() {
    return `${this.timeStamp.toISOString()} [${this.name}] ${this.message}`;
  }
}
