/**
 * @fileoverview {@link Attributes} — a bag of key/value pairs on a span,
 * event, or resource.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { AttributeValue } from './AttributeValue.ts';

/**
 * Key/value pairs attached to a span, span event, or resource. Keys should
 * follow OpenTelemetry semantic conventions where one applies (`http.method`,
 * `db.system`, …) so backends can interpret them.
 */
export type Attributes = Record<string, AttributeValue>;
