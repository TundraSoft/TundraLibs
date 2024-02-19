import { AbstractTranslator } from '../../Translator.ts';
import type { ColumnIdentifier, Expressions } from '../../types/mod.ts';

export class SQLiteTranslator extends AbstractTranslator {
  protected _schemaSupported = false;
  constructor() {
    super('SQLITE');
  }

  protected _quote(name: string): string {
    return name.split('.').filter((v) => v !== undefined && v.length > 0).map((
      part,
    ) => `"${part}"`).join('.');
  }

  protected _JSONValue(column: string, path: string[]): string {
    const ret: string[] = [this._quote(column)];
    while (path.length > 1) {
      ret.push(`'${path.shift()}'`);
    }
    return `${ret.join(' -> ')} ->> '${path[0]}'`;
  }

  protected _JSONRow(data: Record<string, string>): string {
    return `JSON_AGG(JSON_BUILD_OBJECT(${
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
        return crypto.randomUUID();
      case 'current_date':
        return "DATE('now')";
      case 'current_time':
        return "TIME('now')";
      case 'current_timestamp':
        return 'CURRENT_TIMESTAMP';
      case 'now':
        return "datetime('now')";
      case 'substr':
        return `substr(${processExpression(expr.$args[0])}, ${expr.$args[1]}, ${
          expr.$args[2]
        })`;
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
