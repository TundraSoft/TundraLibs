import { AbstractTranslator } from '../../Translator.ts';
import type { Expressions, ColumnIdentifier } from '../../types/mod.ts';

export class MariaTranslator extends AbstractTranslator {
  protected _schemaSupported = true;
  constructor() {
    super('MARIA');
  }

  protected _quote(name: string): string {
    return name.split('.').filter((v) => v !== undefined && v.length > 0).map((
      part,
    ) => `\`${part}\``).join('.');
  }

  protected _JSONValue(column: string, path: string[]): string {
    return `JSON_VALUE(${this._quote(column)}, '$.${path.join('.')}')`;
  }

  protected _JSONRow(data: Record<string, string>): string {
    return `JSON_ARRAYAGG(JSON_OBJECT(${
      Object.entries(data).map(([k, v]) => `'${k}', ${v}`).join(', ')
    }))`;
  }

  protected _processExpressionType(
    expr: Expressions,
    processExpression: (
      expr: ColumnIdentifier | string | number | bigint | Expressions,
    ) => string,
  ): string {
    switch (expr.$expr) {
      case 'UUID':
        return 'uuid()';
      case 'current_date':
        return 'CURDATE()';
      case 'current_time':
        return 'CURRENT_TIME()';
      case 'current_timestamp':
        return 'CURRENT_TIMESTAMP';
      case 'now':
        return 'NOW()';
      case 'substr':
        return `SUBSTRING(${processExpression(expr.$args[0])} FROM ${
          expr.$args[1]
        } FOR ${expr.$args[2]})`;
      case 'concat':
        return `CONCAT(${
          expr.$args.map((arg) => processExpression(arg)).join(', ')
        })`;
      case 'replace':
        return `REPLACE(${processExpression(expr.$args[0])}, ${
          processExpression(expr.$args[1])
        }, ${processExpression(expr.$args[2])})`;
      case 'lower':
        return `LOWER(${processExpression(expr.$args)})`;
      case 'upper':
        return `UPPER(${processExpression(expr.$args)})`;
      case 'trim':
        return `TRIM(${processExpression(expr.$args)})`;
      case 'length':
        return `LENGTH(${processExpression(expr.$args)})`;
      case 'add':
        return `(${
          expr.$args.map((arg) => processExpression(arg)).join(' + ')
        })`;
      case 'subtract':
        return `(${
          expr.$args.map((arg) => processExpression(arg)).join(' - ')
        })`;
      case 'divide':
        return `(${
          expr.$args.map((arg) => processExpression(arg)).join(' / ')
        })`;
      case 'multiply':
        return `(${
          expr.$args.map((arg) => processExpression(arg)).join(' * ')
        })`;
      case 'modulo':
        return `MOD(${processExpression(expr.$args[0])}, ${
          processExpression(expr.$args[1])
        })`;
      case 'abs':
        return `ABS(${processExpression(expr.$args)})`;
      case 'ceil':
        return `CEIL(${processExpression(expr.$args)})`;
      case 'floor':
        return `FLOOR(${processExpression(expr.$args)})`;
      default:
        throw new Error(`Unsupported expression type: ${expr.$expr}`);
    }
  }
}
