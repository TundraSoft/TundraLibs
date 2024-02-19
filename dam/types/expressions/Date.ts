import type { ColumnIdentifier } from '../ColumnIdentifier.ts';

type Now = {
  $expr: 'now';
};

type CurrentDate = {
  $expr: 'current_date';
};

type CurrentTime = {
  $expr: 'current_time';
};

type CurrentTimestamp = {
  $expr: 'current_timestamp';
};

type DateAdd = {
  $expr: 'date_add';
  $args: [
    'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND',
    DateExpressions | ColumnIdentifier | Date,
    number,
  ];
};

export type DateExpressions =
  | Now
  | CurrentDate
  | CurrentTime
  | CurrentTimestamp
  | DateAdd;
