import type { TimeUnit } from './TimeUnit.ts';

/**
 * Period a `DATE_TRUNC` expression truncates to — the calendar subset of
 * {@link TimeUnit}.
 */
export type DateTruncUnit = Extract<TimeUnit, 'DAYS' | 'MONTHS' | 'YEARS'>;
