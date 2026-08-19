/**
 * @fileoverview {@link RapidContextQuerySort} — one parsed sort instruction.
 *
 * @module
 */

/** One parsed sort instruction (`sort=name:desc` → field + direction). */
export type RapidContextQuerySort = {
  /** The sort field, LOWERCASED (the consumer re-cases via its allowlist). */
  field: string;
  /** Sort direction; anything not `desc` (case-insensitive) is ASC. */
  direction: 'ASC' | 'DESC';
};
