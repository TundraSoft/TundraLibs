/**
 * @fileoverview Shared overload parsing for the `(amount?, labels?)`
 * mutation signatures on Counter and Gauge.
 *
 * @module
 */

/**
 * Normalise the `(amountOrLabels?, maybeLabels?)` overload pair used
 * by {@link Counter}'s `inc` and {@link Gauge}'s `inc`/`dec` into an
 * explicit `{ amount, labels }` object. `amount` defaults to `1` when
 * the first argument is a labels record or omitted.
 */
export function parseAmountArgs(
  amountOrLabels: number | Record<string, string> | undefined,
  maybeLabels: Record<string, string> | undefined,
): { amount: number; labels: Record<string, string> | undefined } {
  if (typeof amountOrLabels === 'number') {
    return { amount: amountOrLabels, labels: maybeLabels };
  }
  return { amount: 1, labels: amountOrLabels };
}
