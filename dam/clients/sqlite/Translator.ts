import { AbstractTranslator } from '../../Translator.ts';
import { DAMTranslatorBaseError } from '../../errors/mod.ts';
import type {
  CreateTableColumnDefinition,
  DataTypes,
  Query,
  TruncateQuery,
} from '../../types/mod.ts';

export class SQLiteTranslator extends AbstractTranslator {
  public readonly capability = {
    cascade: true,
    matview: false,
    distributed: false,
  };

  protected _dataTypes: Record<DataTypes, string> = {
    'AUTO_INCREMENT': 'AUTOINCREMENT',
    'SERIAL': 'AUTOINCREMENT',
    'BIGSERIAL': 'AUTOINCREMENT',
    'BIGINT': 'BIGINT',
    'SMALLINT': 'INTEGER',
    'MEDIUMINT': 'INTEGER',
    'INTEGER': 'INTEGER',
    'NUMERIC': 'NUMERIC',
    'DECIMAL': 'DECIMAL',
    'DOUBLE': 'DOUBLE',
    'REAL': 'REAL',
    'FLOAT': 'DOUBLE',
    'UUID': 'UUID',
    'GUID': 'UUID',
    'CHAR': 'CHARACTER',
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
    'JSON': 'TEXT',
    'JSONB': 'TEXT',
  };

  protected _escapeChar: string = '"';

  constructor() {
    super('SQLITE');
  }

  public truncate(obj: TruncateQuery): Query {
    if (obj.type !== 'TRUNCATE') {
      throw new DAMTranslatorBaseError(
        `Invalid query type: ${obj.type}`,
        { dialect: this.dialect },
      );
    }
    return this.delete({
      type: 'DELETE',
      source: obj.source,
      schema: obj.schema,
      columns: [],
    });
  }

  protected _generateAggregateSQL(name: string, args: string[]): string {
    switch (name) {
      case 'JSON_ROW':
        return `JSON_ARRAY(JSON_OBJECT(${args.join(', ')}))`;
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
      case 'CURRENT_DATE':
        return `DATE('now')`;
      case 'CURRENT_TIME':
        return `TIME('now')`;
      case 'CURRENT_TIMESTAMP':
        return 'CURRENT_TIMESTAMP';
      case 'UUID':
        return `lower(
          hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || 
          substr(hex( randomblob(2)), 2) || '-' || 
          substr('AB89', 1 + (abs(random()) % 4) , 1)  ||
          substr(hex(randomblob(2)), 2) || '-' || 
          hex(randomblob(6))
        )`;
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
