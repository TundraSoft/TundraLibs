import { AbstractTranslator } from '../../Translator.ts';
import { DAMTranslatorBaseError } from '../../errors/mod.ts';
import type {
  CreateTableColumnDefinition,
  DataTypes,
  Operators,
} from '../../types/mod.ts';

export class PostgresTranslator extends AbstractTranslator {
  public readonly capability = {
    cascade: true,
    matview: true,
    distributed: false,
  };

  protected _dataTypes: Record<DataTypes, string> = {
    'AUTO_INCREMENT': 'SERIAL',
    'SERIAL': 'SERIAL',
    'BIGSERIAL': 'BIGSERIAL',
    'BIGINT': 'BIGINT',
    'SMALLINT': 'INTEGER',
    'MEDIUMINT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'NUMERIC': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'DOUBLE': 'DOUBLE PRECISION',
    'REAL': 'REAL',
    'FLOAT': 'FLOAT',
    'UUID': 'UUID',
    'GUID': 'UUID',
    'CHAR': 'CHAR',
    'VARCHAR': 'VARCHAR',
    'TEXT': 'TEXT',
    'BLOB': 'BYTEA',
    'BIT': 'BIT',
    'BINARY': 'BYTEA',
    'BOOLEAN': 'BOOLEAN',
    'BOOL': 'BOOLEAN',
    'DATE': 'DATE',
    'DATETIME': 'TIMESTAMP',
    'TIME': 'TIME',
    'TIMESTAMP': 'TIMESTAMP',
    'TIMESTAMPZ': 'TIMESTAMPTZ',
    'JSON': 'JSONB',
    'JSONB': 'JSONB',
  };

  constructor() {
    super('POSTGRES');
  }

  public escape(name: string) {
    return name.replaceAll('"', '').split('.').map((part) => `"${part}"`).join(
      '.',
    );
  }

  public quote(value: unknown): string {
    if (value === undefined || value === null) {
      return 'NULL';
    } else if (
      ['string', 'number', 'bigint', 'boolean'].includes(typeof value)
    ) {
      return `'${value}'`;
    } else if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    } else if (Array.isArray(value)) {
      return `ARRAY[${value.map((v) => this.quote(v)).join(', ')}]`;
    } else {
      return `'${JSON.stringify(value)}'`;
    }
  }

  protected _generateAggregateSQL(name: string, args: string[]): string {
    switch (name) {
      case 'SUM':
        return `SUM(${args.join(', ')})`;
      case 'MIN':
        return `MIN(${args.join(', ')})`;
      case 'MAX':
        return `MAX(${args.join(', ')})`;
      case 'AVG':
        return `AVG(${args.join(', ')})`;
      case 'COUNT':
        return `COUNT(${args.join(', ')})`;
      case 'DISTINCT':
        return `DISTINCT(${args.join(', ')})`;
      case 'JSON_ROW':
        return `JSON_AGG(JSONB_BUILD_OBJECT(${args.join(', ')}))`;
      default:
        throw new DAMTranslatorBaseError(
          `Invalid aggregate function: ${name}`,
          { dialect: this.dialect },
        );
    }
  }

  protected _generateExpressionSQL(name: string, args: string[]): string {
    switch (name) {
      case 'JSON_VALUE': {
        // Escape first value
        args = args.map((arg, i) => {
          if (i === 0) {
            return this.escape(arg);
          } else {
            return `'${arg}'`;
          }
        });
        const path = args.slice(0, -1);
        const last = args[args.length - 1];
        return `${path.join(' -> ')} ->> ${last}`;
        // return `${path.join(' -> ')} ->> ${args[args.length - 1]}`;
      }
      case 'NOW':
        return 'NOW()';
      case 'CURRENT_DATE':
        return 'CURRENT_DATE';
      case 'CURRENT_TIME':
        return 'CURRENT_TIME';
      case 'CURRENT_TIMESTAMP':
        return 'CURRENT_TIMESTAMP';
      case 'UUID':
        return `GEN_RANDOM_UUID()`;
      case 'ADD':
        return `(${args.join(' + ')})`;
      case 'SUBTRACT':
        return `(${args.join(' - ')})`;
      case 'MULTIPLY':
        return `(${args.join(' * ')})`;
      case 'DIVIDE':
        return `(${args.join(' / ')})`;
      case 'MODULO':
        return `(${args.join(' % ')})`;
      case 'ABS':
        return `ABS(${args[0]})`;
      case 'CEIL':
        return `CEIL(${args[0]})`;
      case 'FLOOR':
        return `FLOOR(${args[0]})`;
      case 'CONCAT':
        return `(${args.join(' || ')})`;
      case 'LOWER':
        return `LOWER(${args[0]})`;
      case 'UPPER':
        return `UPPER(${args[0]})`;
      case 'TRIM':
        return `TRIM(${args[0]})`;
      case 'LENGTH':
        return `LENGTH(${args[0]})`;
      case 'SUBSTR':
        return `SUBSTRING(${args[0]} FROM ${args[1]} FOR ${args[2]})`;
      case 'REPLACE':
        return `REPLACE(${args[0]}, ${args[1]}, ${args[2]})`;
      case 'DATE_DIFF':
        return `DATE_DIFF(${args.join(', ')})`;
      case 'DATE_ADD':
        return `DATE_ADD(${args.join(', ')})`;
      case 'DATE_FORMAT':
        return `DATE_FORMAT(${args.join(', ')})`;
      default:
        throw new DAMTranslatorBaseError(
          `Invalid expression function: ${name}`,
          { dialect: this.dialect },
        );
    }
  }

  protected _generateFilterSQL(
    column: string,
    operator: Operators,
    value: string[],
  ): string {
    switch (operator) {
      case '$eq':
        return `${column} = ${value[0]}`;
      case '$ne':
        return `${column} != ${value[0]}`;
      case '$null':
        return value[0] === 'true'
          ? `${column} IS NULL`
          : `${column} IS NOT NULL`;
      case '$gt':
        return `${column} > ${value[0]}`;
      case '$gte':
        return `${column} >= ${value[0]}`;
      case '$lt':
        return `${column} < ${value[0]}`;
      case '$lte':
        return `${column} <= ${value[0]}`;
      case '$between':
        return `${column} BETWEEN ${value[0]} AND ${value[1]}`;
      case '$in':
        return `${column} IN (${value.join(', ')})`;
      case '$nin':
        return `${column} NOT IN (${value.join(', ')})`;
      case '$like':
        return `${column} LIKE ${value[0]}`;
      case '$ilike':
        return `${column} ILIKE ${value[0]}`;
      case '$nlike':
        return `${column} NOT LIKE ${value[0]}`;
      case '$nilike':
        return `${column} NOT ILIKE ${value[0]}`;
      case '$contains':
        return `${column} LIKE %${value[0]}%`;
      case '$ncontains':
        return `${column} NOT LIKE %${value[0]}%`;
      case '$startsWith':
        return `${column} LIKE ${value[0]}%`;
      case '$nstartsWith':
        return `${column} NOT LIKE ${value[0]}%`;
      case '$endsWith':
        return `${column} LIKE %${value[0]}`;
      case '$nendsWith':
        return `${column} NOT LIKE %${value[0]}`;
      default:
        throw new DAMTranslatorBaseError(`Invalid operator: ${operator}`, {
          dialect: this.dialect,
        });
    }
  }

  protected _generateColumnDefinition(
    name: string,
    defn: CreateTableColumnDefinition,
  ): string {
    const type = this._dataTypes[defn.type];
    if (type === undefined) {
      throw new DAMTranslatorBaseError(`Invalid data type: ${defn.type}`, {
        dialect: this.dialect,
      });
    }
    let sql = `${this.escape(name)} ${type}`;
    if (['CHAR', 'VARCHAR'].includes(defn.type)) {
      if (defn.length) {
        sql += `(${defn.length[0]})`;
      }
    } else if (['NUMERIC', 'DECIMAL'].includes(defn.type)) {
      if (defn.length) {
        if (defn.length) {
          sql += `(${defn.length.join(', ')})`;
        }
      }
    }
    if (defn.nullable === false) {
      sql += ' NOT NULL';
    }
    // if(defn.autoIncrement) {
    //   sql += ' AUTO_INCREMENT';
    // }
    // if(defn.primaryKey) {
    //   sql += ' PRIMARY KEY';
    // }
    // if(defn.unique) {
    //   sql += ' UNIQUE';
    // }
    // if(defn.default !== undefined) {
    //   sql += ` DEFAULT ${this.quote(defn.default)}`;
    // }
    return sql;
  }
}
