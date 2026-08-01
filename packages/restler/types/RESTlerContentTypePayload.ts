/**
 * @fileoverview Maps a content type to its expected payload shape.
 *
 * @module
 */
import type { RESTlerContentType } from './RESTlerContentType.ts';

/**
 * Maps a content type to its expected payload type
 *
 * Both fields are optional: a request may declare a `contentType` without a
 * `payload`, or omit both.
 *
 * @typeParam P - Content type to define the payload format for
 */
export type RESTlerContentTypePayload<
  P extends RESTlerContentType = RESTlerContentType,
> = {
  /** The content type of the payload */
  contentType?: P;
  /**
   * The payload data, typed according to the content type:
   * - JSON/XML: Record<string, unknown>
   * - FORM: FormData
   * - TEXT: string
   * - BLOB: Blob
   */
  payload?: P extends 'JSON' | 'XML' ? Record<string, unknown>
    : P extends 'FORM' ? FormData
    : P extends 'TEXT' ? string
    : P extends 'BLOB' ? Blob
    : never;
};
