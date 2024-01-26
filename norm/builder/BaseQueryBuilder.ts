import { Dialects } from '../types/mod.ts';

export class BaseQueryBuilder {
  protected _schema?: string;
  protected _table!: string;

  constructor() {}

  setSource(source: [string, string]) {
    if (source.length === 2) {
      this.setSchema(source[0]);
      this.setTable(source[1])
    } else {
      this.setTable(source[0]);
    }
    return this;
  }

  setSchema(schema: string) {
    this._schema = schema;
    return this;
  }

  setTable(table: string) {
    this._table = table;
  }

  public toSQLQuery(dialect: Omit<Dialects, 'MONGO'>): [string, Record<string, unknown> | undefined] {
    throw new Error('Not implemented');
  }

  public toMongoQuery(): Record<string, unknown> {
    throw new Error('Not implemented');
  }
}

