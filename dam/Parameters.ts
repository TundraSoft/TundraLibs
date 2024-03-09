import { alphaNumeric, nanoId } from '../id/mod.ts';

export class Parameters {
  private _params: Map<unknown, string> = new Map();
  private _counter = 0;
  private _name = nanoId(5, alphaNumeric);

  constructor(name?: string) {
    if (name !== undefined) {
      this._name = name;
    }
  }

  create(value: unknown): string {
    if (value instanceof Object && !(value instanceof Date)) {
      value = JSON.stringify(value);
    }
    if (this._params.has(value)) {
      return this._params.get(value) as string;
    } else {
      const name = `p_${this._name}_${this._counter++}`;
      this._params.set(value, name);
      return name;
    }
  }

  get size() {
    return this._params.size;
  }

  asRecord() {
    const record: Record<string, unknown> = {};
    this._params.forEach((value, key) => {
      record[value] = key;
    });
    return record;
  }
}
