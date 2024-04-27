import { AbstractTranslator } from '../../Translator.ts';
import { DAMTranslatorError } from '../../errors/mod.ts';
import type {
  CreateTableColumnDefinition,
  DataTypes,
  Operators,
  TranslatorCapability,
} from '../../types/mod.ts';

export class PostgresTranslator extends AbstractTranslator {
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
    'TIMESTAMPTZ': 'TIMESTAMPTZ',
    'JSON': 'JSONB',
    'JSONB': 'JSONB',
  };

  protected _escapeChar: string = '"';

  constructor(capabilities: Partial<TranslatorCapability> = {}) {
    const cap = {
      ...{
        cascade: false,
        matview: false,
        distributed: false,
        partition: false,
      },
      ...capabilities,
    };
    super('POSTGRES', cap);
  }

  protected _generateAggregateSQL(name: string, args: string[]): string {
    switch (name) {
      case 'JSON_ROW':
        return `JSON_AGG(JSONB_BUILD_OBJECT(${args.join(', ')}))`;
      default:
        return super._generateAggregateSQL(name, args);
    }
  }

  protected _generateExpressionSQL(name: string, args: string[]): string {
    /**
     * We handle only specific cases here, what is default will be handled by
     * the parent class
     */
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
      }
      case 'UUID':
        return `GEN_RANDOM_UUID()`;
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
        return super._generateExpressionSQL(name, args);
    }
  }

  protected _generateFilterSQL(
    column: string,
    operator: Operators,
    value: string[],
  ): string {
    switch (operator) {
      case '$ilike':
        return `${column} ILIKE ${value[0]}`;
      case '$nilike':
        return `${column} NOT ILIKE ${value[0]}`;
      default:
        return super._generateFilterSQL(column, operator, value);
    }
  }

  protected _generateColumnDefinition(
    name: string,
    defn: CreateTableColumnDefinition,
  ): string {
    const type = this._dataTypes[defn.type];
    if (type === undefined) {
      throw new DAMTranslatorError(`Data Type definition missing for ${name}`, {
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
