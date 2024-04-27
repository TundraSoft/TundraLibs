import { AbstractTranslator } from '../../Translator.ts';
import type {
  CreateTableColumnDefinition,
  DataTypes,
  TranslatorCapability,
} from '../../types/mod.ts';
import { DAMTranslatorError } from '../../errors/mod.ts';

export class MariaTranslator extends AbstractTranslator {
  protected _dataTypes: Record<DataTypes, string> = {
    'AUTO_INCREMENT': 'AUTO_INCREMENT',
    'SERIAL': 'AUTO_INCREMENT',
    'BIGSERIAL': 'AUTO_INCREMENT',
    'BIGINT': 'BIGINT',
    'SMALLINT': 'SMALLINT',
    'MEDIUMINT': 'MEDIUMINT',
    'INTEGER': 'INTEGER',
    'NUMERIC': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'DOUBLE': 'DOUBLE',
    'REAL': 'REAL',
    'FLOAT': 'DOUBLE',
    'UUID': 'UUID',
    'GUID': 'UUID',
    'CHAR': 'CHAR',
    'VARCHAR': 'VARCHAR',
    'TEXT': 'TEXT',
    'BLOB': 'TEXT',
    'BIT': 'BIT',
    'BINARY': 'TEXT',
    'BOOLEAN': 'BOOLEAN',
    'BOOL': 'BOOLEAN',
    'DATE': 'DATE',
    'DATETIME': 'TIMESTAMP',
    'TIME': 'TIME',
    'TIMESTAMP': 'TIMESTAMP',
    'TIMESTAMPTZ': 'TIMESTAMP',
    'JSON': 'JSON',
    'JSONB': 'JSON',
  };

  protected _escapeChar: string = '`';

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
    super('MARIA', cap);
  }

  protected _generateAggregateSQL(name: string, args: string[]): string {
    switch (name) {
      case 'JSON_ROW':
        return `JSON_ARRAYAGG(JSON_OBJECT(${args.join(', ')}))`;
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
        const column = args.shift() as string;
        return `JSON_VALUE(${this.escape(column)}, '$.${args.join('.')}')`;
      }
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
