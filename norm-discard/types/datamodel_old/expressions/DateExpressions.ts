export type NowExpression = 'NOW';
export type TodayExpression = 'TODAY';
export type CurrentMonthExpression = 'CURRENT_MONTH';
export type CurrentYearExpression = 'CURRENT_YEAR';
export type CurrentQuarterExpression = 'CURRENT_QUARTER';
export type CurrentWeekExpression = 'CURRENT_WEEK';
export type CurrentDayExpression = 'CURRENT_DAY';
export type CurrentHourExpression = 'CURRENT_HOUR';
export type DateAddExpression = {
  source: string | Date | DateExpression;
  part: 'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND';
  value: number;
};

// Returns a non date value, i.e number
export type AgeExpression = {
  source: string | Date | DateExpression;
};

// Returns a non date value, i.e string
export type DateFormatExpression = {
  source: string | Date | DateExpression;
  format?:
    | 'YYYY-MM-DD'
    | 'YYYY-MM-DD HH:mm:ss'
    | 'YYYY-MM-DD HH:mm:ss.SSS'
    | 'YYYY-MM-DD HH:mm:ss.SSSSSS';
};

// Returns a non date value, i.e number
export type DatePartExpression = {
  source: string | Date | DateExpression;
  part: 'YEAR' | 'MONTH' | 'DAY' | 'HOUR' | 'MINUTE' | 'SECOND';
};

export type DateExpression =
  | NowExpression
  | TodayExpression
  | CurrentMonthExpression
  | CurrentYearExpression
  | CurrentQuarterExpression
  | CurrentWeekExpression
  | CurrentDayExpression
  | CurrentHourExpression
  | AgeExpression
  | DateFormatExpression
  | DatePartExpression
  | DateAddExpression;
