/**
 * Time unit for date/time arithmetic. Used in `DATE_ADD` and
 * `DATE_DIFF` expressions to specify the unit of time.
 */
export type TimeUnit =
  | 'DAYS'
  | 'MONTHS'
  | 'YEARS'
  | 'HOURS'
  | 'MINUTES'
  | 'SECONDS';
