import type { QueryFilters } from '../types/mod.ts';

export const QueryTranslatorConfig = {
  escapeIdentifier: '"',
  quoteIdentifier: '"',
  cascade: {
    database: true,
    schema: true,
  },
  dataTypes: {
    'INT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'SMALLINT': 'SMALLINT',
    'TINYINT': 'TINYINT',
    'BIGINT': 'BIGINT',
    'REAL': 'REAL',
    'FLOAT': 'FLOAT',
    'DOUBLE PRECISION': 'DOUBLE',
    'DOUBLE': 'DOUBLE',
    'NUMERIC': 'DECIMAL',
    'NUMBER': 'DECIMAL',
    'DECIMAL': 'DECIMAL',
    'MONEY': 'DECIMAL',
    // Boolean
    'BIT': 'BOOLEAN',
    'BOOLEAN': 'BOOLEAN',
    'BINARY': 'BOOLEAN',
    // String
    'CHAR': 'CHAR',
    'CHARACTER': 'CHAR',
    'VARCHAR': 'VARCHAR',
    'NVARCHAR': 'VARCHAR',
    'NCHAR': 'CHAR',
    'CHARACTER VARYING': 'VARCHAR',
    'TEXT': 'TEXT',
    // Date & Time
    'DATE': 'DATE',
    'DATE_Z': 'DATE',
    'TIME': 'TIME',
    'TIME_Z': 'TIME',
    'DATETIME': 'DATETIME',
    'DATETIME_Z': 'DATETIME',
    'TIMESTAMP': 'TIMESTAMP',
    'TIMESTAMP_Z': 'TIMESTAMP',
    // Special
    'BLOB': 'BLOB',
    'UUID': 'UUID',
    'JSON': 'JSON',
    'ARRAY': 'VARCHAR[]',
    'ARRAY_STRING': 'VARCHAR[]',
    'ARRAY_INTEGER': 'INTEGER[]',
    'ARRAY_BIGINT': 'BIGINT[]',
    'ARRAY_DECIMAL': 'DECIMAL[]',
    'ARRAY_BOOLEAN': 'BOOLEAN[]',
    'ARRAY_DATE': 'DATE[]',
    'ARRAY_DATE_Z': 'DATE[]',
    'AUTO_INCREMENT': 'SERIAL',
    'SERIAL': 'SERIAL',
    'SMALLSERIAL': 'SMALLSERIAL',
    'BIGSERIAL': 'BIGSERIAL',
  },
  escape: (value: Array<string | undefined>): string => {
    const escapeIdentifier = QueryTranslatorConfig.escapeIdentifier;
    const val = value.filter((v) => v !== undefined).reverse().join('.');
    return val.replace(`/${escapeIdentifier}/g`, '').split('.').map((v) =>
      `${escapeIdentifier}${v}${escapeIdentifier}`
    ).join('.');
  },
  // deno-lint-ignore no-explicit-any
  quoteValue(value: any): string {
    if (
      typeof value === null || typeof value === 'function' ||
      typeof value === 'symbol' || typeof value === 'undefined' ||
      String(value).toUpperCase() === 'NULL'
    ) {
      return 'NULL';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value + '';
    }
    if (value instanceof Date) {
      return this.quoteValue(`${value.toISOString()}`);
    }
    if (value instanceof Array || Array.isArray(value)) {
      return 'ARRAY [' + value.map((v) => this.quoteValue(v)).join(',') + ']';
    }
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    } else {
      value += '';
    }
    // This handles DB Function calls
    if (value.substr(0, 2) === '${') {
      return value.substr(2, value.length - 3);
    }
    // Escape quotes already present
    const findRegEx = new RegExp(QueryTranslatorConfig.quoteIdentifier, 'g'),
      replace = QueryTranslatorConfig.quoteIdentifier +
        QueryTranslatorConfig.quoteIdentifier;
    // return `'${value.replace(/'/g, "''")}'`;
    return `${QueryTranslatorConfig.quoteIdentifier}${
      value.replace(findRegEx, replace)
    }${QueryTranslatorConfig.quoteIdentifier}`;
  },

  //#region Query Generators
  insert: (
    table: Array<string | undefined>,
    columns: string[],
    values: Record<string, unknown>[],
    project: Record<string, string>,
  ): string => {
    // Move this to config
    const returning = ` RETURNING ${
      Object.entries(project).map(([key, value]) =>
        `${QueryTranslatorConfig.escape([key])} AS ${
          QueryTranslatorConfig.escape([value])
        }`
      ).join(', ')
    }`;
    return `INSERT INTO ${QueryTranslatorConfig.escape(table)} (${
      columns.map((c) => QueryTranslatorConfig.escape([c])).join(', ')
    }) VALUES (${
      values.map((v) =>
        Object.values(v).map((c) => QueryTranslatorConfig.quoteValue(c)).join(
          ', ',
        )
      ).join('), (')
    })${returning};`;
  },

  update: (
    table: Array<string | undefined>,
    values: Record<string, unknown>,
    project: Record<string, string>,
    filter?: QueryFilters,
  ): string => {
    const returning = ` RETURNING ${
      Object.entries(project).map(([key, value]) =>
        `${QueryTranslatorConfig.escape([key])} AS ${
          QueryTranslatorConfig.escape([value])
        }`
      ).join(', ')
    }`;
    const where = filter ? ` WHERE ${QueryTranslatorConfig.where(filter)}` : '';
    return `UPDATE ${QueryTranslatorConfig.escape(table)} SET ${
      Object.entries(values).map(([key, value]) =>
        `${QueryTranslatorConfig.escape([key])} = ${
          QueryTranslatorConfig.quoteValue(value)
        }`
      ).join(', ')
    }${where}${returning};`;
  },

  delete: (table: Array<string | undefined>, filter?: QueryFilters): string => {
    const where = filter ? ` WHERE ${QueryTranslatorConfig.where(filter)}` : '';
    return `DELETE FROM ${QueryTranslatorConfig.escape(table)}${where};`;
  },

  truncate: (table: Array<string | undefined>): string => {
    return `TRUNCATE TABLE ${QueryTranslatorConfig.escape(table)};`;
  },

  createSchema: (schema: string): string => {
    return `CREATE SCHEMA IF NOT EXISTS ${
      QueryTranslatorConfig.escape([schema])
    };`;
  },

  dropSchema: (schema: string): string => {
    return `DROP SCHEMA IF EXISTS ${QueryTranslatorConfig.escape([schema])};`;
  },

  dropTable: (table: string, schema?: string): string => {
    return `DROP TABLE IF EXISTS ${
      QueryTranslatorConfig.escape([table, schema])
    };`;
  },

  renameTable: (
    newName: Array<string | undefined>,
    oldName: Array<string | undefined>,
  ): string => {
    return `ALTER TABLE ${QueryTranslatorConfig.escape(oldName)} RENAME TO ${
      QueryTranslatorConfig.escape(newName)
    };`;
  },

  dropColumn: (name: string, table: string, schema?: string): string => {
    return `ALTER TABLE ${
      QueryTranslatorConfig.escape([table, schema])
    } DROP COLUMN ${QueryTranslatorConfig.escape([name])};`;
  },

  renameColumn: (
    newName: string,
    oldName: string,
    table: string,
    schema?: string,
  ): string => {
    return `ALTER TABLE ${
      QueryTranslatorConfig.escape([table, schema])
    } RENAME COLUMN ${QueryTranslatorConfig.escape([oldName])} TO ${
      QueryTranslatorConfig.escape([newName])
    };`;
  },

  where: (filter: QueryFilters, joiner = 'AND'): string => {
    const ret: string[] = [];
    if (Array.isArray(filter)) {
      filter.forEach((f) => {
        ret.push(QueryTranslatorConfig.where(f, joiner));
      });
    } else {
      // Ok if the key is $and or $or then its a sub query
      const keys = Object.keys(filter);
      for (const key of keys) {
        if (key === '$and' || key === '$or') {
          ret.push(
            `${
              QueryTranslatorConfig.where(
                filter[key] as unknown as QueryFilters,
                key === '$and' ? 'AND' : 'OR',
              )
            }`,
          );
        } else {
          // Ok, now we need to check if the value is an object or not
          const value = filter[key];
          if (
            value instanceof Object &&
            (!(value instanceof Date) || !(value instanceof Array))
          ) {
            for (
              const [operator, operatorValue] of Object.entries(
                value,
              )
            ) {
              // const actValue = (operatorValue as string).startsWith('$') ? columns[operatorValue as string] : operatorValue;
              switch (operator) {
                case '$eq':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} = ${
                      QueryTranslatorConfig.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$ne':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} != ${
                      QueryTranslatorConfig.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$gt':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} > ${
                      QueryTranslatorConfig.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$gte':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} >= ${
                      QueryTranslatorConfig.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$lt':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} < ${
                      QueryTranslatorConfig.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$lte':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} <= ${
                      QueryTranslatorConfig.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$in':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} IN (${
                      operatorValue.map((v: unknown) =>
                        QueryTranslatorConfig.quoteValue(v)
                      ).join(', ')
                    })`,
                  );
                  break;
                case '$nin':
                  ret.push(
                    `${QueryTranslatorConfig.escape([key])} NOT IN (${
                      operatorValue.map((v: unknown) =>
                        QueryTranslatorConfig.quoteValue(v)
                      ).join(', ')
                    })`,
                  );
                  break;
                default:
                  throw new Error(`Unknown Operator ${operator}`);
              }
            }
          } else {
            ret.push(
              `${QueryTranslatorConfig.escape([key])} = ${
                QueryTranslatorConfig.quoteValue(value)
              }`,
            );
          }
          // if(typeof filter[key] === 'object') {
          //   // Ok, now we need to check if the value is an object or not
          //   const subKeys = Object.keys(filter[key]);
          //   for(const subKey of subKeys) {
          //     ret.push(`${this._escape(key)} ${subKey} ${this._escape(filter[key][subKey])}`);
          //   }
          // }
        }
      }
    }
    return `( ${ret.join(` ${joiner} `)} )`;
  },
  //#endregion Query Generators
};
