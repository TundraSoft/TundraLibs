import type { ColumnIdentifier } from '../columns/mod.ts';
import type { DateExpressions } from './DateExpressions.ts';

type UUIDExpression = 'NEW_UUID';
type GUIDExpression = 'NEW_GUID';

type StringExpressionType = string | ColumnIdentifier | StringExpressions;

type ConcatExpression = {
  concat: Array<StringExpressionType>;
};
type SubstringExpression = {
  substring: [StringExpressionType, number, number];
};
type ReplaceExpression = {
  replace: [StringExpressionType, StringExpressionType, StringExpressionType];
};
type LowerExpression = {
  lower: StringExpressionType;
};
type UpperExpression = {
  upper: StringExpressionType;
};
type TrimExpression = {
  trim: StringExpressionType;
};

// export type LeftExpression = {
//   left: [StringExpressionType, number];
// };
// export type RightExpression = {
//   right: [StringExpressions | string, number];
// };
// export type LpadExpression = {
//   lpad: [StringExpressions | string, number, string];
// };
// export type RpadExpression = {
//   rpad: [StringExpressions | string, number, string];
// };
// export type PositionExpression = {
//   position: [StringExpressions | string, StringExpressions | string];
// };
// export type StrposExpression = {
//   strpos: [StringExpressions | string, StringExpressions | string];
// };
// export type RepeatExpression = {
//   repeat: [StringExpressions | string, number];
// };
// export type ReverseExpression = {
//   reverse: StringExpressions | string;
// };
// export type StrcmpExpression = {
//   // strcmp: [StringExpressions | string, StringExpressions | string];
//   expr: 'STRCMP';
//   args: [StringExpressions | string, StringExpressions | string];
// };
// export type SpaceExpression = {
//   expr: 'SPACE';
//   args: [StringExpressions | string, number];
// };

type DateFormatExpression = {
  dateFormat: {
    date: Date | ColumnIdentifier | DateExpressions;
    format:
      | 'YYYY'
      | 'YYYY-MM'
      | 'YYYY-MM-DD'
      | 'YYYY-MM-DD HH:mm:ss'
      | 'MM-DD'
      | 'MM-DD-YYYY'
      | 'MM-DD-YYYY HH:mm:ss'
      | 'DD-MM'
      | 'DD-MM-YYYY'
      | 'DD-MM-YYYY HH:mm:ss'
      | 'HH'
      | 'HH:mm'
      | 'HH:mm:ss';
  };
};

export type StringGenerators = UUIDExpression | GUIDExpression;

export type StringExpressions =
  | UUIDExpression
  | GUIDExpression
  | ConcatExpression
  | SubstringExpression
  | ReplaceExpression
  | LowerExpression
  | UpperExpression
  | TrimExpression
  | DateFormatExpression;
