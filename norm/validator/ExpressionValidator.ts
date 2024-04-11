import { ExpressionNames, type Expressions } from '../../dam/mod.ts';
import { isValidName } from './isValidName.ts';
import {
  NORMColumnExpressionConfigError,
  NORMInvalidNameError,
} from '../errors/mod.ts';

export const ExpressionValidator = (
  expr: Expressions,
  exprName: string,
  model: string,
  columns: Array<string> = [],
) => {
  if (isValidName(exprName, false)) {
    throw new NORMInvalidNameError({
      model,
      value: exprName,
      item: 'expression',
      isDBName: false,
    });
  }
  const { $expr, $args } = { ...{ $args: undefined }, ...expr };
  if ($expr === undefined) {
    throw new NORMColumnExpressionConfigError({
      model,
      column: exprName,
      item: 'UNKNOWN',
    });
  }
  if (!ExpressionNames.includes($expr)) {
    throw new NORMColumnExpressionConfigError({
      model,
      column: exprName,
      item: 'UNKNOWN',
    });
  }
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
            throw new NORMColumnExpressionConfigError({
              model,
              column: exprName,
              item: 'ARG',
              argColumn: arg.substring(1),
            });
          }
        }
      } else if (
        typeof arg === 'object' && Object.keys(arg).includes('$expr')
      ) {
        ExpressionValidator(arg as Expressions, exprName, model, columns);
      }
    });
  }
};
