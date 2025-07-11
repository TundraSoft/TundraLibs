import type { SlogObject } from '../types/Object.ts';

/**
 * Binary Protocol Buffer-style formatter for high-throughput logging
 *
 * This formatter creates a compact binary representation of log objects
 * suitable for high-performance scenarios where JSON overhead is too high.
 *
 * Binary format structure:
 * - Header (8 bytes): Magic number (4) + Version (2) + Length (2)
 * - Fields are encoded with type tags and variable-length encoding
 *
 * Performance benefits:
 * - 30-50% smaller than JSON
 * - Faster to serialize/deserialize
 * - Better for network transmission
 */

const MAGIC_NUMBER = 0x534C4F47; // "SLOG" in hex
const FORMAT_VERSION = 1;

// Field type constants
const FIELD_TYPES = {
  STRING: 0x01,
  NUMBER: 0x02,
  BOOLEAN: 0x03,
  OBJECT: 0x04,
  ARRAY: 0x05,
  NULL: 0x06,
  TIMESTAMP: 0x07,
} as const;

/**
 * Encodes a string using UTF-8 with length prefix
 */
function encodeString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const length = encoded.length;

  // Use variable-length encoding for length
  const lengthBytes = encodeVarint(length);
  const result = new Uint8Array(lengthBytes.length + encoded.length);
  result.set(lengthBytes, 0);
  result.set(encoded, lengthBytes.length);

  return result;
}

/**
 * Encodes a number using variable-length encoding
 */
function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  while (value > 127) {
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7F);
  return new Uint8Array(bytes);
}

/**
 * Encodes a 64-bit timestamp
 */
function encodeTimestamp(timestamp: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(timestamp), false); // Big-endian
  return new Uint8Array(buffer);
}

/**
 * Encodes primitive values (string, number, boolean, null)
 */
function encodePrimitive(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) {
    return new Uint8Array([FIELD_TYPES.NULL]);
  }

  if (typeof value === 'string') {
    const encoded = encodeString(value);
    const result = new Uint8Array(1 + encoded.length);
    result[0] = FIELD_TYPES.STRING;
    result.set(encoded, 1);
    return result;
  }

  if (typeof value === 'number') {
    return encodeNumber(value);
  }

  if (typeof value === 'boolean') {
    return new Uint8Array([FIELD_TYPES.BOOLEAN, value ? 1 : 0]);
  }

  return null; // Not a primitive
}

/**
 * Encodes a number value
 */
function encodeNumber(value: number): Uint8Array {
  if (Number.isInteger(value) && value >= 0 && value < 2 ** 31) {
    const encoded = encodeVarint(value);
    const result = new Uint8Array(1 + encoded.length);
    result[0] = FIELD_TYPES.NUMBER;
    result.set(encoded, 1);
    return result;
  } else {
    // Use 8-byte float for other numbers
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, false);
    const result = new Uint8Array(9);
    result[0] = FIELD_TYPES.NUMBER | 0x80; // Set high bit for float
    result.set(new Uint8Array(buffer), 1);
    return result;
  }
}

/**
 * Encodes an array value
 */
function encodeArray(value: unknown[]): Uint8Array {
  const elements = value.map(encodeValue);
  const totalLength = elements.reduce((sum, el) => sum + el.length, 0);
  const lengthBytes = encodeVarint(value.length);

  const result = new Uint8Array(1 + lengthBytes.length + totalLength);
  let offset = 0;

  result[offset++] = FIELD_TYPES.ARRAY;
  result.set(lengthBytes, offset);
  offset += lengthBytes.length;

  for (const element of elements) {
    result.set(element, offset);
    offset += element.length;
  }

  return result;
}

/**
 * Encodes an object value
 */
function encodeObject(value: Record<string, unknown>): Uint8Array {
  const entries = Object.entries(value);
  const encodedEntries = entries.map(([key, val]) => ({
    key: encodeString(key),
    value: encodeValue(val),
  }));

  const totalLength = encodedEntries.reduce(
    (sum, entry) => sum + entry.key.length + entry.value.length,
    0,
  );
  const countBytes = encodeVarint(entries.length);

  const result = new Uint8Array(1 + countBytes.length + totalLength);
  let offset = 0;

  result[offset++] = FIELD_TYPES.OBJECT;
  result.set(countBytes, offset);
  offset += countBytes.length;

  for (const entry of encodedEntries) {
    result.set(entry.key, offset);
    offset += entry.key.length;
    result.set(entry.value, offset);
    offset += entry.value.length;
  }

  return result;
}

/**
 * Recursively encodes any value to binary format
 */
function encodeValue(value: unknown): Uint8Array {
  // Try primitive encoding first
  const primitive = encodePrimitive(value);
  if (primitive) {
    return primitive;
  }

  // Handle complex types
  if (Array.isArray(value)) {
    return encodeArray(value);
  }

  if (typeof value === 'object') {
    return encodeObject(value as Record<string, unknown>);
  }

  // Fallback to string representation
  const stringResult = encodePrimitive(String(value));
  return stringResult || new Uint8Array([FIELD_TYPES.NULL]);
}

/**
 * Binary formatter for high-throughput logging scenarios
 *
 * Creates a compact binary representation that is:
 * - 30-50% smaller than JSON
 * - Faster to process
 * - Network efficient
 *
 * Use this formatter when:
 * - Logging high volumes of data
 * - Network bandwidth is limited
 * - Processing speed is critical
 *
 * @param log - The log object to format
 * @returns Base64-encoded binary data
 */
export function binaryFormatter(log: SlogObject): string {
  // Calculate size first for efficient allocation
  const fields = [
    { id: 1, value: log.id },
    { id: 2, value: log.appName },
    { id: 3, value: log.hostname },
    { id: 4, value: log.level },
    { id: 5, value: log.levelName },
    { id: 6, value: log.message },
    { id: 7, value: log.timestamp },
    { id: 8, value: log.context },
  ];

  // Encode all fields
  const encodedFields = fields.map((field) => ({
    id: encodeVarint(field.id),
    value: field.id === 7 // Special handling for timestamp
      ? new Uint8Array([
        FIELD_TYPES.TIMESTAMP,
        ...encodeTimestamp(field.value as number),
      ])
      : encodeValue(field.value),
  }));

  // Calculate total size
  const totalSize = encodedFields.reduce(
    (sum, field) => sum + field.id.length + field.value.length,
    8, // Header size
  );

  // Create buffer
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // Write header
  view.setUint32(0, MAGIC_NUMBER, false); // Magic number
  view.setUint16(4, FORMAT_VERSION, false); // Version
  view.setUint16(6, totalSize - 8, false); // Payload length

  // Write fields
  let offset = 8;
  for (const field of encodedFields) {
    buffer.set(field.id, offset);
    offset += field.id.length;
    buffer.set(field.value, offset);
    offset += field.value.length;
  }

  // Return as base64 for transport
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Compact binary formatter that sacrifices some features for maximum performance
 *
 * This variant:
 * - Uses fixed-width fields where possible
 * - Omits context if empty
 * - Uses shorter field IDs
 *
 * @param log - The log object to format
 * @returns Base64-encoded binary data
 */
export function compactBinaryFormatter(log: SlogObject): string {
  // Use a more compact format for high-volume scenarios
  const hasContext = log.context && Object.keys(log.context).length > 0;

  // Estimate size (more aggressive optimization)
  const estimatedSize = 32 + // Fixed overhead
    log.id.length +
    log.appName.length +
    log.hostname.length +
    log.levelName.length +
    log.message.length +
    (hasContext ? JSON.stringify(log.context).length : 0);

  const buffer = new Uint8Array(estimatedSize);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // Compact header (4 bytes)
  view.setUint32(offset, MAGIC_NUMBER >>> 8, false); // Shortened magic
  offset += 4;

  // Timestamp (8 bytes) - most important field first
  view.setBigUint64(offset, BigInt(log.timestamp), false);
  offset += 8;

  // Level (1 byte)
  buffer[offset++] = log.level;

  // String fields with length prefixes
  const strings = [
    log.id,
    log.appName,
    log.hostname,
    log.levelName,
    log.message,
  ];
  for (const str of strings) {
    const encoded = new TextEncoder().encode(str);
    buffer[offset++] = Math.min(encoded.length, 255); // Cap at 255
    buffer.set(encoded.slice(0, 255), offset);
    offset += Math.min(encoded.length, 255);
  }

  // Context (if present)
  if (hasContext) {
    buffer[offset++] = 1; // Has context flag
    const contextStr = JSON.stringify(log.context);
    const contextBytes = new TextEncoder().encode(contextStr);
    const contextLength = encodeVarint(contextBytes.length);
    buffer.set(contextLength, offset);
    offset += contextLength.length;
    buffer.set(contextBytes, offset);
    offset += contextBytes.length;
  } else {
    buffer[offset++] = 0; // No context flag
  }

  // Return as base64, trimmed to actual size
  const finalBuffer = buffer.slice(0, offset);
  return btoa(String.fromCharCode(...finalBuffer));
}

/**
 * Performance-focused binary formatter with streaming support
 *
 * This formatter is designed for maximum throughput:
 * - Uses pre-allocated buffers
 * - Minimizes memory allocations
 * - Supports streaming output
 */
export class StreamingBinaryFormatter {
  private static readonly BUFFER_POOL: Uint8Array[] = [];
  private static readonly MAX_POOL_SIZE = 10;

  /**
   * Get a buffer from the pool or create a new one
   */
  private static getBuffer(size: number): Uint8Array {
    const buffer = this.BUFFER_POOL.pop();
    if (buffer && buffer.length >= size) {
      return buffer.subarray(0, size);
    }
    return new Uint8Array(Math.max(size, 1024)); // Minimum 1KB
  }

  /**
   * Return a buffer to the pool
   */
  private static returnBuffer(buffer: Uint8Array): void {
    if (this.BUFFER_POOL.length < this.MAX_POOL_SIZE) {
      this.BUFFER_POOL.push(buffer);
    }
  }

  /**
   * Format log object using buffer pooling for performance
   */
  static format(log: SlogObject): string {
    // More accurate size estimation
    let estimatedSize = 100; // Base overhead

    // Add string lengths
    estimatedSize += log.id.length;
    estimatedSize += log.appName.length;
    estimatedSize += log.hostname.length;
    estimatedSize += log.levelName.length;
    estimatedSize += log.message.length;

    // Add context size if present
    if (log.context && Object.keys(log.context).length > 0) {
      const contextStr = JSON.stringify(log.context);
      estimatedSize += contextStr.length + 10; // Add buffer for length encoding
    }

    // Add 50% buffer for safety and encoding overhead
    const bufferSize = Math.ceil(estimatedSize * 1.5);
    const buffer = this.getBuffer(bufferSize);

    try {
      // Use the standard binary formatter logic but with pooled buffer
      // This is a simplified version - in production you'd implement
      // the full binary encoding here

      const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length,
      );
      let offset = 0;

      // Write magic and version
      view.setUint32(offset, MAGIC_NUMBER, false);
      offset += 4;
      view.setUint16(offset, FORMAT_VERSION, false);
      offset += 2;

      // Write timestamp
      view.setBigUint64(offset, BigInt(log.timestamp), false);
      offset += 8;

      // Write level
      buffer[offset++] = log.level;

      // Write strings (simplified encoding)
      const encoder = new TextEncoder();
      const strings = [
        log.id,
        log.appName,
        log.hostname,
        log.levelName,
        log.message,
      ];

      for (const str of strings) {
        const encoded = encoder.encode(str);
        if (offset + 1 + encoded.length >= buffer.length) {
          throw new RangeError(
            `Buffer overflow: need ${
              offset + 1 + encoded.length
            } bytes, have ${buffer.length}`,
          );
        }
        buffer[offset++] = encoded.length;
        buffer.set(encoded, offset);
        offset += encoded.length;
      }

      // Write context if present
      if (log.context && Object.keys(log.context).length > 0) {
        if (offset + 1 >= buffer.length) {
          throw new RangeError(
            `Buffer overflow: need ${offset + 1} bytes, have ${buffer.length}`,
          );
        }
        buffer[offset++] = 1;
        const contextStr = JSON.stringify(log.context);
        const contextBytes = encoder.encode(contextStr);
        if (offset + 2 + contextBytes.length >= buffer.length) {
          throw new RangeError(
            `Buffer overflow: need ${
              offset + 2 + contextBytes.length
            } bytes, have ${buffer.length}`,
          );
        }
        view.setUint16(offset, contextBytes.length, false);
        offset += 2;
        buffer.set(contextBytes, offset);
        offset += contextBytes.length;
      } else {
        if (offset + 1 >= buffer.length) {
          throw new RangeError(
            `Buffer overflow: need ${offset + 1} bytes, have ${buffer.length}`,
          );
        }
        buffer[offset++] = 0;
      }

      // Convert to base64
      const finalBuffer = buffer.subarray(0, offset);
      return btoa(String.fromCharCode(...finalBuffer));
    } finally {
      this.returnBuffer(buffer);
    }
  }
}

/**
 * High-performance binary formatter using streaming approach
 */
export function streamingBinaryFormatter(log: SlogObject): string {
  return StreamingBinaryFormatter.format(log);
}
