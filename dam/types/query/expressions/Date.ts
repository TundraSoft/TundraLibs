import type { ColumnIdentifier } from '../ColumnIdentifier.ts';

type Now = {
  $expr: 'NOW';
};

type CurrentDate = {
  $expr: 'CURRENT_DATE';
};

type CurrentTime = {
  $expr: 'CURRENT_TIME';
};

type CurrentTimestamp = {
  $expr: 'CURRENT_TIMESTAMP';
};

type DateAdd = {
  $expr: 'DATE_ADD';
  $args: [
    'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND',
    DateExpressions | ColumnIdentifier | Date,
    number,
  ];
};

// type CastDate = {
//   $expr: 'DATE';
//   $args: [DateExpressions | ColumnIdentifier, 'DATE'];
// };

// type CastDateTime = {
//   $expr: 'DATETIME';
//   $args: [DateExpressions | ColumnIdentifier, 'DATE'];
// };

export type DateExpressions =
  | Now
  | CurrentDate
  | CurrentTime
  | CurrentTimestamp
  | DateAdd;
// | CastDate
// | CastDateTime;
