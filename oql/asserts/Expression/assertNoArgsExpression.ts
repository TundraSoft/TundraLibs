/**
 * Asserts that a value is a valid no-argument expression (NOW, CURRENT_DATE, CURRENT_TIME, CURRENT_TIMESTAMP, CURRENT_TIMESTAMPTZ, UUID).
 *
 * These expressions don't require any arguments.
 */
export function assertNoArgsExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type:
    | 'NOW'
    | 'CURRENT_DATE'
    | 'CURRENT_TIME'
    | 'CURRENT_TIMESTAMP'
    | 'CURRENT_TIMESTAMPTZ'
    | 'UUID';
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  const validTypes = [
    'NOW',
    'CURRENT_DATE',
    'CURRENT_TIME',
    'CURRENT_TIMESTAMP',
    'CURRENT_TIMESTAMPTZ',
    'UUID',
  ];

  if (!validTypes.includes(obj.type as string)) {
    throw new TypeError(
      customMessage ??
        `Invalid expression: type must be one of ${validTypes.join(', ')}`,
    );
  }

  // These expressions should only have the 'type' property
  const validProps = ['type'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Should only have 'type' property. Found unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }
}
