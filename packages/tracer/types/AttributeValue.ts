/**
 * @fileoverview {@link AttributeValue} — the value types OTLP permits on a
 * span attribute.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * A single attribute value. OTLP permits primitives and homogeneous arrays of
 * primitives only — no nested objects, no mixed arrays. Values outside this
 * union are dropped at encode time rather than silently mangled.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];
