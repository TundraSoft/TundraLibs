import type { DateExpressions, DateGenerators } from './DateExpressions.ts';
import type { NumericExpressions } from './NumericExpressions.ts';
import type {
  StringExpressions,
  StringGenerators,
} from './StringExpressions.ts';

export type {
  DateExpressions,
  DateGenerators,
  NumericExpressions,
  StringExpressions,
  StringGenerators,
};

export type Generators = DateGenerators | StringGenerators;

export type ColumnExpressions =
  | DateExpressions
  | NumericExpressions
  | StringExpressions;

// export function processExpression(expression: ColumnExpressions) {
//   if (typeof expression === 'string') {
//     console.log('Generator');
//   } else {
//     if (Object.keys(expression).length > 1) {
//       throw new Error(`Only one expression can be passed`);
//     }
//     const [key, value] = Object.entries(expression)[0];
//     switch (key) {
//       case 'add':
//         console.log('add', value);
//         break;
//       case 'sub':
//         console.log('sub', value);
//         break;
//       case 'mul':
//         console.log('mul', value);
//         value.forEach((v) => processExpression(v));
//         break;
//       case 'concat':
//         console.log('concat', value);
//         break;
//       case 'substring':
//         console.log('substring', value);
//         break;
//       default:
//         throw new Error(`Expression ${key} not supported`);
//     }
//   }
// }

// const a: ColumnExpressions = {
//   mul: [10, { add: [1, 2]}],
// };

// processExpression(a);
