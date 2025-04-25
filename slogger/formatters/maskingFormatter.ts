import type { SlogObject } from '../types/mod.ts';
import { jsonFormatter } from './jsonFormatter.ts';

/**
 * Masking strategy to use for sensitive fields
 */
export enum MaskingStrategy {
  /** Replace entire value with mask characters */
  FULL,
  /** Show first and last character, mask the rest */
  PARTIAL,
  /** Show first N characters, mask the rest */
  PREFIX,
  /** Show last N characters, mask the rest */
  SUFFIX,
}

/**
 * Configuration for masking sensitive information
 */
export type MaskingConfig = {
  /** Fields to mask in the context object (case-sensitive) */
  sensitiveFields?: string[];
  /** Regular expressions to match sensitive data in messages */
  sensitivePatterns?: RegExp[];
  /** Character to use for masking (default: '*') */
  maskChar?: string;
  /** Strategy to use for masking (default: FULL) */
  strategy?: MaskingStrategy;
  /** Number of characters to show for PREFIX/SUFFIX strategies (default: 4) */
  showChars?: number;
  /** Whether to recursively search nested objects (default: true) */
  recursive?: boolean;
  /** Base formatter to use (default: jsonFormatter) */
  baseFormatter?: (log: SlogObject) => string;
};

/**
 * Default sensitive field names to mask
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'secret',
  'credential',
  'token',
  'apiKey',
  'api_key',
  'auth',
  'key',
  'private',
  'cvv',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
];

/**
 * Default regex patterns to mask in message strings
 */
const DEFAULT_SENSITIVE_PATTERNS = [
  // Credit card numbers: 16 digits, may have spaces or dashes
  /\b(?:\d[ -]*?){13,16}\b/g,
  // API keys, tokens, etc. (common formats)
  /(?:api[_-\s]?key|token|secret|password)[:=]\s*["']?([a-zA-Z0-9_.-]+)["']?/gi,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // SSN format (US)
  /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
];

/**
 * Masks a string value based on the provided strategy
 *
 * @param value - The string to mask
 * @param config - Masking configuration
 * @returns The masked string
 */
function maskValue(value: string, config: Required<MaskingConfig>): string {
  const length = value.length;

  if (length === 0) return '';

  switch (config.strategy) {
    case MaskingStrategy.FULL: {
      return config.maskChar.repeat(length);
    }

    case MaskingStrategy.PARTIAL: {
      if (length <= 2) return config.maskChar.repeat(length);
      return value[0] + config.maskChar.repeat(length - 2) + value[length - 1];
    }

    case MaskingStrategy.PREFIX: {
      const prefixLen = Math.min(config.showChars, length);
      return value.substring(0, prefixLen) +
        config.maskChar.repeat(length - prefixLen);
    }

    case MaskingStrategy.SUFFIX: {
      const suffixLen = Math.min(config.showChars, length);
      return config.maskChar.repeat(length - suffixLen) +
        value.substring(length - suffixLen);
    }

    default: {
      return config.maskChar.repeat(length);
    }
  }
}

/**
 * Recursively masks sensitive fields in an object
 *
 * @param obj - The object to process
 * @param config - Masking configuration
 * @returns A new object with masked values
 */
function maskObject(
  obj: Record<string, unknown>,
  config: Required<MaskingConfig>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if this is a sensitive field
    const isSensitive = config.sensitiveFields.some((field) =>
      key.toLowerCase().includes(field.toLowerCase())
    );

    if (isSensitive && typeof value === 'string') {
      // Mask sensitive string values
      result[key] = maskValue(value, config);
    } else if (isSensitive && typeof value === 'number') {
      // Convert numbers to strings before masking
      result[key] = maskValue(String(value), config);
    } else if (
      config.recursive && typeof value === 'object' && value !== null
    ) {
      // Recursively process nested objects
      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? maskObject(item as Record<string, unknown>, config)
            : item
        );
      } else {
        result[key] = maskObject(value as Record<string, unknown>, config);
      }
    } else {
      // Pass through non-sensitive values
      result[key] = value;
    }
  }

  return result;
}

/**
 * Masks sensitive patterns in a message string
 *
 * @param message - The message to process
 * @param config - Masking configuration
 * @returns The message with sensitive data masked
 */
function maskMessage(message: string, config: Required<MaskingConfig>): string {
  let result = message;

  for (const pattern of config.sensitivePatterns) {
    result = result.replace(pattern, (match) => maskValue(match, config));
  }

  return result;
}

/**
 * Creates a formatter that masks sensitive information
 *
 * @param config - Configuration for masking sensitive data
 * @returns A formatter function that masks sensitive information
 */
export function maskingFormatter(
  config: MaskingConfig = {},
): (log: SlogObject) => string {
  // Merge provided config with defaults
  const fullConfig: Required<MaskingConfig> = {
    sensitiveFields: config.sensitiveFields || [...DEFAULT_SENSITIVE_FIELDS],
    sensitivePatterns: config.sensitivePatterns ||
      [...DEFAULT_SENSITIVE_PATTERNS],
    maskChar: config.maskChar || '*',
    strategy: config.strategy !== undefined
      ? config.strategy
      : MaskingStrategy.FULL,
    showChars: config.showChars || 4,
    recursive: config.recursive !== false,
    baseFormatter: config.baseFormatter || jsonFormatter,
  };

  // Return the formatter function
  return (log: SlogObject): string => {
    // Create a deep clone of the log object to avoid modifying the original
    const clonedLog: SlogObject = JSON.parse(JSON.stringify(log));

    // Mask sensitive data in the message
    clonedLog.message = maskMessage(clonedLog.message, fullConfig);

    // Mask sensitive fields in the context
    if (clonedLog.context && typeof clonedLog.context === 'object') {
      clonedLog.context = maskObject(
        clonedLog.context as Record<string, unknown>,
        fullConfig,
      );
    }

    // Apply the base formatter to the masked log object
    return fullConfig.baseFormatter(clonedLog);
  };
}

/**
 * Default masking formatter with standard settings
 */
export const defaultMaskingFormatter = maskingFormatter();
