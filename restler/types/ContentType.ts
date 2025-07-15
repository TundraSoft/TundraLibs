/**
 * Supported content types for RESTler requests and responses.
 *
 * - JSON: Application/json content
 * - XML: Application/xml content
 * - FORM: Form data (application/x-www-form-urlencoded)
 * - TEXT: Plain text content
 * - BLOB: Binary data
 */
export type RESTlerContentType =
  | 'JSON'
  | 'XML'
  | 'FORM'
  | 'TEXT'
  | 'BLOB';

/**
 * Type definition for content type and associated payload.
 * Maps each content type to its expected payload format.
 *
 * @template P Content type to define the payload format for
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
