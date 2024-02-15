export class Query {
  protected _source: [string, string?];
  protected _columns: {
    [key: string]: {
      alias: string;
      type?: string;
    };
  } = {};
  protected _computed: {
    [key: string]: string;
  } = {};

  constructor(source: [string, string?]) {
    this._source = source;
  }

  addColumn(name: string, alias?: string, type?: string) {
    this._columns[name] = {
      alias: alias || name,
      type: type,
    };
  }

  getColumn(name: string) {
    return this._columns[name];
  }

  removeColumn(name: string) {
    delete this._columns[name];
  }

  newInsert() {}
}
