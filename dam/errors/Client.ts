import { DAMBaseError } from './Base.ts';

export class DAMClientError extends DAMBaseError {
  public readonly config: string;
  constructor(
    message: string,
    meta: { name: string; dialect: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
    this.config = meta.name as string || 'N/A';
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.dialect} ${this.config} ${this.name}] ${this.message}`;
  }
}
