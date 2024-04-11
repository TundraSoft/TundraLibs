import { ExpressionNames, type Expressions } from '../../dam/mod.ts';
import {
  NORMInvalidExpression,
  NORMMissingColumnError,
} from '../errors/mod.ts';

export const expressionChecker = (
  model: string,
  name: string,
  expression: Expressions,
  columns?: string[],
) => {
  const { $expr } = expression;
  if ($expr === undefined) {
    throw new NORMInvalidExpression('undefined', model, name);
  }
  if (!ExpressionNames.includes($expr)) {
    throw new NORMInvalidExpression($expr, model, name);
  }
  // Check for expression parameters
  const { $args } = { ...{ $args: undefined }, ...expression };
  if ($args !== undefined) {
    const args = Array.isArray($args) ? $args : [$args];
    // If any one of the args is an expression, validate that also
    // Remove this column from columns list
    if (columns) {
      columns = columns.filter((column) => column !== `${name}`);
    }
    args.forEach((arg) => {
      if (typeof arg === 'string' && columns) {
        if (arg.startsWith('$')) {
          if (!columns.includes(arg.substring(1))) {
            // throw new Error(`Column ${arg} not found in columns`);
            throw new NORMMissingColumnError(model, name);
          }
        }
      } else if (
        typeof arg === 'object' && Object.keys(arg).includes('$expr')
      ) {
        expressionChecker(model, name, arg as Expressions);
      }
    });
  }
};
