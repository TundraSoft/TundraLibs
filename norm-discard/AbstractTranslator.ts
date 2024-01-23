import { Dialects } from './types/Dialects.ts';

export class AbstractTranslator {
  protected _dialect: Dialects;
  declare protected _escapeIdentifier: string;
  declare protected _quoteIdentifier: string;

  constructor(dialect: Dialects) {
    this._dialect = dialect;
  }

  get dialect(): Dialects {
    return this._dialect;
  }

  public escape(value: string[]): string {
    return value.map((v) => this.escape(v)).join(', ');
  }

  public quote(value: string[]): string {
  }

  public select(): string {}

  public insert(): string {
  }

  public update(): string {}

  public delete(): string {}

  public truncate(): string {}
}
