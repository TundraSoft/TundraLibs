type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE TABLE';
type QueryData = {
  tableName: string;
  fields?: string[];
  values?: any[];
  conditions?: string;
};

interface DBConfig {
  identifierQuote: string;
  functionMappings: { [key: string]: string };
}

const postgresConfig: DBConfig = {
  identifierQuote: `"`,
  functionMappings: {
    'UUID': 'uuid_generate_v4()',
  },
};

const mariaDBConfig: DBConfig = {
  identifierQuote: '`',
  functionMappings: {
    'UUID': 'UUID()',
  },
};

class QueryTranslator {
  private type: QueryType;
  private data: QueryData;
  private dbConfig: DBConfig;

  constructor(
    type: QueryType,
    data: QueryData,
    db: 'PostgreSQL' | 'MariaDB' | 'MongoDB',
  ) {
    this.type = type;
    this.data = data;
    this.dbConfig = db === 'PostgreSQL' ? postgresConfig : mariaDBConfig; // Choose the config based on the db
  }

  private quoteIdentifier(identifier: string): string {
    return `${this.dbConfig.identifierQuote}${identifier}${this.dbConfig.identifierQuote}`;
  }

  private mapFunction(funcName: string): string {
    return this.dbConfig.functionMappings[funcName] || funcName;
  }

  toString(): string {
    // Generate SQL statement based on the query type
    switch (this.type) {
      case 'SELECT':
        return `SELECT ${
          this.data.fields?.map((field) => this.quoteIdentifier(field)).join(
            ', ',
          ) || '*'
        } FROM ${this.quoteIdentifier(this.data.tableName)}` +
          (this.data.conditions ? ` WHERE ${this.data.conditions}` : '');
      case 'INSERT':
        return `INSERT INTO ${this.quoteIdentifier(this.data.tableName)} (${
          this.data.fields?.map((field) => this.quoteIdentifier(field)).join(
            ', ',
          )
        }) VALUES (${this.data.values?.map((val) => `'${val}'`).join(', ')})`;
      case 'UPDATE':
        const setClause = this.data.fields?.map((field, idx) =>
          `${this.quoteIdentifier(field)} = '${this.data.values?.[idx]}'`
        ).join(', ');
        return `UPDATE ${
          this.quoteIdentifier(this.data.tableName)
        } SET ${setClause}` +
          (this.data.conditions ? ` WHERE ${this.data.conditions}` : '');
      case 'DELETE':
        return `DELETE FROM ${this.quoteIdentifier(this.data.tableName)}` +
          (this.data.conditions ? ` WHERE ${this.data.conditions}` : '');
      case 'CREATE TABLE':
        const columns = this.data.fields?.map((field) =>
          `${this.quoteIdentifier(field)} TEXT`
        ).join(', ');
        return `CREATE TABLE ${
          this.quoteIdentifier(this.data.tableName)
        } (${columns})`;
      default:
        return '';
    }
  }

  toObject(): any {
    // Generate MongoDB query object based on the query type
    switch (this.type) {
      case 'SELECT':
        return { find: this.data.tableName, filter: this.data.conditions };
      case 'INSERT':
        const insertDoc = this.data.fields?.reduce(
          (doc, field, idx) => ({ ...doc, [field]: this.data.values?.[idx] }),
          {},
        );
        return { insert: this.data.tableName, document: insertDoc };
      case 'UPDATE':
        const updateDoc = this.data.fields?.reduce(
          (doc, field, idx) => ({ ...doc, [field]: this.data.values?.[idx] }),
          {},
        );
        return {
          update: this.data.tableName,
          update: updateDoc,
          filter: this.data.conditions,
        };
      case 'DELETE':
        return { delete: this.data.tableName, filter: this.data.conditions };
      case 'CREATE TABLE':
        // MongoDB doesn't have a direct equivalent to SQL's CREATE TABLE, but you could create a collection
        return { createCollection: this.data.tableName };
      default:
        return {};
    }
  }
}

// Example Usage:
const queryPostgres = new QueryTranslator('SELECT', {
  tableName: 'users',
  fields: ['id', 'name'],
  conditions: 'id = 1',
}, 'PostgreSQL');
console.log(queryPostgres.toString()); // SQL statement with PostgreSQL specifics

const queryMariaDB = new QueryTranslator('SELECT', {
  tableName: 'users',
  fields: ['id', 'name'],
  conditions: 'id = 1',
}, 'MariaDB');
console.log(queryMariaDB.toString()); // SQL statement with MariaDB specifics

type Email = `${string}@${string}.${string}`;

type InsertTemplate = (
  table: string | [string, string],
  values: Record<string, unknown>,
) => [string, Record<string, unknown>];

const insert: InsertTemplate = (table, values) => {
  const tableName = Array.isArray(table) ? `${table[0]}.${table[1]}` : table;
  const cols = Object.keys(values).join(', ');
  const params: Record<string, unknown> = {};
  const vals = Object.keys(values).map((key, index) => {
    const paramKey = `:value${index + 1}`;
    params[paramKey] = values[key];
    return paramKey;
  }).join(', ');
  const query = `INSERT INTO ${tableName} (${cols}) VALUES (${vals})`;
  return [query, params];
};

console.log(insert('users', { name: 'John Doe', email: 'sdf@sdf.com' }));
console.log(
  insert(['public', 'users'], { name: 'John Doe', email: 'sdf@sdf.com' }),
);

type BulkInsertTemplate = (
  table: string | [string, string],
  records: Record<string, unknown>[],
) => [string, Record<string, unknown>[]];

const bulkInsert: BulkInsertTemplate = (table, records) => {
  const tableName = Array.isArray(table) ? `${table[0]}.${table[1]}` : table;
  const cols = Object.keys(records[0]).join(', ');
  const allParams: Record<string, unknown>[] = [];
  const allVals = records.map((record, recordIndex) => {
    const params: Record<string, unknown> = {};
    const vals = Object.keys(record).map((key, index) => {
      const paramKey = `:value${recordIndex + 1}_${index + 1}`;
      params[paramKey] = record[key];
      return paramKey;
    }).join(', ');
    allParams.push(params);
    return `(${vals})`;
  }).join(', ');
  const query = `INSERT INTO ${tableName} (${cols}) VALUES ${allVals}`;
  return [query, allParams];
};

console.log(
  bulkInsert('users', [{ name: 'John Doe', email: 'john@example.com' }, {
    name: 'Jane Doe',
    email: 'jane@example.com',
  }]),
);
console.log(
  bulkInsert(['public', 'users'], [{
    name: 'John Doe',
    email: 'john@example.com',
  }, { name: 'Jane Doe', email: 'jane@example.com' }]),
);
