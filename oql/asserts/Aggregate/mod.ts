/**
 * Aggregate assertion utilities.
 *
 * Provides runtime validation for aggregate function objects used in queries.
 * All assertions throw TypeError if validation fails.
 */

export * from './assertAggregate.ts';
export * from './assertCount.ts';
export * from './assertNumericAggregate.ts';
export * from './assertStringAgg.ts';
export * from './assertArrayAgg.ts';
export * from './assertJsonRow.ts';
