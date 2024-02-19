import { AbstractTranslator } from '../../Translator.ts';
import type { Expressions } from '../../types/mod.ts';

export class PostgresTranslator extends AbstractTranslator {
  protected _schemaSupported = true;
  constructor() {
    super('POSTGRES');
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
    processExpression: (expr: string | Expressions) => string,
  ): string {
    switch (expr.$expr) {
      case 'UUID':
        return 'UUID()';
      case 'current_date':
        return 'CURRENT_DATE';
      case 'current_time':
        return 'CURRENT_TIME';
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
      default:
        return '';
    }
  }
}
