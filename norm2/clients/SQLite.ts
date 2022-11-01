import { AbstractClient } from "../AbstractClient.ts";
import { SQLiteConfig } from "../types/mod.ts";
import { PGClient } from "./dependencies.ts";

export class SQLiteClient<O extends SQLiteConfig = SQLiteConfig>
  extends AbstractClient<O> {
  constructor(config: NonNullable<O> | O) {
    super(config);
  }

  protected async _open(): Promise<void> {
  }

  protected async _close(): Promise<void> {
  }
}
