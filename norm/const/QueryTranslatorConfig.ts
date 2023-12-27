import type {
  ColumnDefinition,
  ForeignKeyDefinition,
  PartitionDefinition,
  QueryFilters,
} from '../types/mod.ts';
export const QueryTranslatorConfig = {
  escapeIdentifier: '"',
  quoteIdentifier: "'",
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
  capabilities: {
    supportsDistribution: false,
    supportsPartitioning: false,
    supportsAddPrimaryKey: false,
    supportsAddUniqueConstraint: false,
    supportsAddForeignKey: false,
  },
  escape: (value: Array<string | undefined>): string => {
    const escapeIdentifier = QueryTranslatorConfig.escapeIdentifier;
    const replceRegEx = new RegExp(`${escapeIdentifier}`, 'g');
    const val = value.filter((v) => v !== undefined).reverse().join('.');
    return val.replace(replceRegEx, '').split('.').map((v) =>
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
  select: (
    table: Array<string | undefined>,
    project: Record<string, string>,
    _filter?: QueryFilters,
    // relations?: {
    //   [key: string]: {
    //     table: Array<string | undefined>;
    //     columns: Record<string, string>;
    //     relationShip: {
    //       [key: string]: string;
    //     };
    //     project?: Record<string, string>;
    //     filter?: QueryFilters;
    //   };
    // },
  ): string => {
    // SELECT MAIN.X, json_agg(json_build_object(ALIAS, JOIN.COL...)) AS ALIAS FROM MAIN AS MAIN LEFT JOIN JOIN AS JOIN ON MAIN.COL = JOIN.COL GROUP BY MAIN.COL
    // Grouping in PG is the PK in main table
    const _tableName = QueryTranslatorConfig.escape(table),
      _selectList = Object.entries(project).map(([key, value]) =>
        `${QueryTranslatorConfig.escape([value])} AS ${
          QueryTranslatorConfig.escape([key])
        }`
      ),
      _joinList: string[] = [];
    // if (relations && Object.keys(relations).length > 0) {
    // }
    return '';
  },

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

  createPrimaryKey: (
    table: Array<string | undefined>,
    primaryKeys: Array<string> | undefined,
  ): string | undefined => {
    if (primaryKeys && primaryKeys.length > 0) {
      if (QueryTranslatorConfig.capabilities.supportsAddPrimaryKey) {
        return `ALTER TABLE ${
          QueryTranslatorConfig.escape(table)
        } ADD PRIMARY KEY (${
          primaryKeys.map((pk) => QueryTranslatorConfig.escape([pk])).join(', ')
        });`;
      } else {
        return `PRIMARY KEY (${
          primaryKeys.map((pk) => QueryTranslatorConfig.escape([pk])).join(', ')
        })`;
      }
    }
  },

  createUniqueConstraints: (
    table: Array<string | undefined>,
    uniqueKeys?: Record<string, Array<string>>,
  ): Array<string> => {
    const result: Array<string> = [];
    if (uniqueKeys) {
      for (const [key, value] of Object.entries(uniqueKeys)) {
        if (QueryTranslatorConfig.capabilities.supportsAddUniqueConstraint) {
          result.push(
            `ALTER TABLE ${
              QueryTranslatorConfig.escape(table)
            } ADD CONSTRAINT ${QueryTranslatorConfig.escape([key])} UNIQUE (${
              value.map((pk) => QueryTranslatorConfig.escape([pk])).join(', ')
            });`,
          );
        } else {
          result.push(
            `CONSTRAINT ${QueryTranslatorConfig.escape([key])} UNIQUE (${
              value.map((pk) => QueryTranslatorConfig.escape([pk])).join(', ')
            })`,
          );
        }
      }
    }
    return result;
  },

  createForeignKeys: (
    table: Array<string | undefined>,
    foreignKeys?: Record<string, ForeignKeyDefinition>,
  ): Array<string> => {
    const result: Array<string> = [];
    if (foreignKeys) {
      for (const [key, value] of Object.entries(foreignKeys)) {
        const refTable = QueryTranslatorConfig.escape([
          value.table,
          value.schema,
        ]);
        const refColumns = Object.values(value.columnMap);
        if (QueryTranslatorConfig.capabilities.supportsAddForeignKey) {
          result.push(
            `ALTER TABLE ${
              QueryTranslatorConfig.escape(table)
            } ADD CONSTRAINT ${
              QueryTranslatorConfig.escape([key])
            } FOREIGN KEY (${
              Object.keys(value.columnMap).map((pk) =>
                QueryTranslatorConfig.escape([pk])
              ).join(', ')
            }) REFERENCES ${refTable} (${
              refColumns.map((pk) => QueryTranslatorConfig.escape([pk])).join(
                ', ',
              )
            }) ON DELETE ${value.onDelete || 'RESTRICT'} ON UPDATE ${
              value.onUpdate || 'RESTRICT'
            };`,
          );
        } else {
          result.push(
            `FOREIGN KEY (${
              Object.keys(value.columnMap).map((pk) =>
                QueryTranslatorConfig.escape([pk])
              ).join(', ')
            }) REFERENCES ${refTable}(${
              refColumns.map((pk) => QueryTranslatorConfig.escape([pk])).join(
                ', ',
              )
            }) ON DELETE ${value.onDelete || 'RESTRICT'} ON UPDATE ${
              value.onUpdate || 'RESTRICT'
            }`,
          );
        }
      }
    }
    return result;
  },

  distributeTable: (
    table: Array<string | undefined>,
    spec: boolean | Array<string> | undefined,
  ): string | undefined => {
    if (QueryTranslatorConfig.capabilities.supportsDistribution && spec) {
      if (typeof spec === 'boolean') {
        return `create_reference_table(${QueryTranslatorConfig.escape(table)})`;
      } else {
        return `create_distributed_table(${
          QueryTranslatorConfig.escape(table)
        }, ${spec.map((s) => QueryTranslatorConfig.escape([s])).join(', ')}))`;
      }
    }
  },

  createTable: (
    table: Array<string | undefined>,
    columns: Array<ColumnDefinition>,
    primaryKeys?: Array<string>,
    uniqueKeys?: Record<string, Array<string>>,
    foreignKeys?: Record<string, ForeignKeyDefinition>,
    partitions?: PartitionDefinition,
    distribution?: boolean | Array<string>,
  ): Array<string> => {
    const result: Array<string> = [];
    // Check if there is a serial, bigserial or auto_increment column
    const containsSerial = columns.some((c) =>
      ['SERIAL', 'SMALLSERIAL', 'BIGSERIAL', 'AUTO_INCREMENT'].includes(c.type)
    );
    const pkQuery = QueryTranslatorConfig.createPrimaryKey(table, primaryKeys);
    // Column Definitions
    let tblDef = `CREATE TABLE IF NOT EXISTS ${
      QueryTranslatorConfig.escape(table)
    } (${
      columns.map((c) => {
        const colName = QueryTranslatorConfig.escape([c.name]);
        const dataType = QueryTranslatorConfig
          .dataTypes[c.type as keyof typeof QueryTranslatorConfig.dataTypes];
        const length = c.length
          ? (typeof c.length === 'number'
            ? `(${c.length})`
            : `(${c.length.precision},${c.length.scale})`)
          : '';
        const nullable = c.nullable ? 'NULL' : 'NOT NULL';
        const isSerial = [
          'SERIAL',
          'SMALLSERIAL',
          'BIGSERIAL',
          'AUTO_INCREMENT',
        ].includes(c.type);
        const primary = isSerial ? 'PRIMARY KEY' : '';
        const defval = c.defaults && c.defaults.create
          ? `DEFAULT ${c.defaults.create}`
          : '';
        const comments = c.comments ? `COMMENT '${c.comments}'` : '';
        return `${colName} ${dataType}${length} ${primary} ${nullable} ${defval} ${comments}`;
      }).concat(
        (!containsSerial &&
            !QueryTranslatorConfig.capabilities.supportsAddPrimaryKey)
          ? (pkQuery ? [pkQuery] : [])
          : [],
      ).concat(
        QueryTranslatorConfig.capabilities.supportsAddForeignKey
          ? []
          : QueryTranslatorConfig.createForeignKeys(table, foreignKeys),
      ).concat(
        QueryTranslatorConfig.capabilities.supportsAddUniqueConstraint
          ? []
          : QueryTranslatorConfig.createUniqueConstraints(table, uniqueKeys),
      ).join(', ')
    });`;
    // Partitions
    if (QueryTranslatorConfig.capabilities.supportsPartitioning && partitions) {
      tblDef += ` PARTITION BY ${partitions.type} (${
        partitions.columns.map((c) => QueryTranslatorConfig.escape([c])).join(
          ', ',
        )
      })`;
    }
    result.push(tblDef);
    // Primary Key
    if (
      QueryTranslatorConfig.capabilities.supportsAddPrimaryKey &&
      !containsSerial
    ) {
      if (pkQuery) {
        result.push(pkQuery);
      }
    }
    // Unique Keys
    if (QueryTranslatorConfig.capabilities.supportsAddUniqueConstraint) {
      result.push(
        ...QueryTranslatorConfig.createUniqueConstraints(table, uniqueKeys),
      );
    }
    // Foreign Keys
    if (QueryTranslatorConfig.capabilities.supportsAddForeignKey) {
      result.push(
        ...QueryTranslatorConfig.createForeignKeys(table, foreignKeys),
      );
    }
    // Distribution
    const distQuery = QueryTranslatorConfig.distributeTable(
      table,
      distribution,
    );
    if (distQuery) {
      result.push(distQuery);
    }
    return result;
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
  //#endregion Query Generators
};
