import type { ColumnIdentifier } from '../columns/mod.ts';

// Generators
type NowExpression = 'NOW';
type TodayExpression = 'TODAY';
type CurrentMonthExpression = 'CURRENT_MONTH';
type CurrentYearExpression = 'CURRENT_YEAR';
type CurrentQuarterExpression = 'CURRENT_QUARTER';
type CurrentWeekExpression = 'CURRENT_WEEK';
type CurrentDayExpression = 'CURRENT_DAY';
type CurrentHourExpression = 'CURRENT_HOUR';

type DateExpressionType = Date | ColumnIdentifier | DateExpressions;

type DateAddExpression = {
  dateAdd: {
    source: DateExpressionType;
    part: 'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND';
    value: number;
  };
};

export type DateGenerators =
  | NowExpression
  | TodayExpression
  | CurrentMonthExpression
  | CurrentYearExpression
  | CurrentQuarterExpression
  | CurrentWeekExpression
  | CurrentDayExpression
  | CurrentHourExpression;

export type DateExpressions =
  | NowExpression
  | TodayExpression
  | CurrentMonthExpression
  | CurrentYearExpression
  | CurrentQuarterExpression
  | CurrentWeekExpression
  | CurrentDayExpression
  | CurrentHourExpression
  | DateAddExpression;
