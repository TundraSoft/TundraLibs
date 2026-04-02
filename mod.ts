/**
 * @fileoverview TundraLibs - A comprehensive collection of TypeScript/Deno utilities
 * @module TundraLibs
 * @version 1.0.0
 * @author TundraSoft
 * @license MIT
 * 
 * Main entry point for TundraLibs package.
 * 
 * @example
 * ```typescript
 * // Import specific utilities
 * import { Guardian, StringGuardian } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * 
 * // Or import entire modules as namespaces
 * import * as Cacher from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/cacher/mod.ts';
 * ```
 */

// ============================================================================
// CACHER MODULE - Caching utilities with multiple backend support
// ============================================================================
export {
  MemCacher,
  type MemCacherOptions,
  MemoryCacher,
  type MemoryCacherOptions,
  RedisCacher,
  type RedisCacherOptions,
  type CacherEngineErrorCode,
  CacherEngineErrorCodes,
  CacherError,
  type CacherOptions,
  type CacheValue,
  type CacheValueOptions,
  AbstractEngine as CacherAbstractEngine,
  Cacher,
} from './cacher/mod.ts';

// ============================================================================
// CRYPT MODULE - Cryptographic utilities, hashing, encryption, JWT, OTP
// ============================================================================
export {
  digest,
  type DigestAlgorithms,
  type DigestOptions,
  sha1,
  sha256,
  sha384,
  sha512,
  validateDigestAlgorithm,
  hash,
  type AESKeyLength,
  type AESMode,
  type AESOptions,
  decrypt,
  decryptAES,
  decryptRSA,
  encrypt,
  encryptAES,
  type EncryptionModes,
  encryptRSA,
  type RSAHashAlgorithm as RSAEncryptHashAlgorithm,
  type RSAKeySize as RSAEncryptKeySize,
  type RSAOptions as RSAEncryptOptions,
  type BIP39Options,
  type BIP39Result,
  type BIP39WordCount,
  type ECKeyOptions,
  type EllipticCurve,
  generate12WordSeed,
  generate24WordSeed,
  generateAlphanumericSecret,
  generateBase32Secret,
  generateBase64Secret,
  generateBIP39Mnemonic,
  type GeneratedKeyPair,
  generateECDHKeys,
  generateECDSAKeys,
  generateECKeyPair,
  generateHexSecret,
  generateKeyPair,
  generatePassword,
  generateRSAEncryptionKeys,
  generateRSAKeyPair,
  generateRSASigningKeys,
  generateSeedPhrase,
  generateToken,
  type KeyAlgorithm,
  type KeyFormat,
  mnemonicToSeed,
  type PasswordOptions,
  randomFloat,
  randomInt,
  randomNumber,
  type RandomNumberOptions,
  type RSAHashAlgorithm,
  type RSAKeyOptions,
  type RSAKeySize,
  type SecretEncoding,
  secretGenerator,
  type SecretGeneratorOptions,
  validateBIP39Mnemonic,
  validateSeedPhrase,
  issueJWT,
  type JWTAlgorithm,
  JWTError,
  JWTErrorCodes,
  type JWTHeader,
  type JWTPayload,
  verifyJWT,
  generateHOTP,
  generateTOTP,
  verifyHOTP,
  verifyTOTP,
  type HMACHashAlgorithm,
  type HMACOptions,
  type RSAHashAlgorithm as RSASignHashAlgorithm,
  type RSAKeySize as RSASignKeySize,
  type RSAOptions as RSASignOptions,
  sign,
  signHMAC,
  type SigningModes,
  signRSA,
  verify,
  verifyHMAC,
  verifyRSA,
} from './crypt/mod.ts';

// ============================================================================
// DAM MODULE - Database Abstraction Manager
// ============================================================================
export {
  AbstractEngine,
  DAMEngineError,
  type DAMEngineErrorCode,
  DAMEngineErrorCodes,
  type DAMEngineErrorMeta,
  type EngineCapabilities,
  type EngineEvents,
  type EngineOptions,
  type EnginePoolStats,
  type EngineQuery,
  type EngineQueryResult,
  type EngineQueryStats,
  type EngineStats,
  type EngineStatus,
  type EngineTransactionOptions,
  type EngineTransactionStatus,
  MariaEngine,
  type MariaEngineOptions,
  MongoEngine,
  type MongoEngineOptions,
  type Postgres2EngineOptions,
  PostgresEngine,
  PostgresEngine2,
  type PostgresEngineOptions,
  SQLiteEngine,
  type SQLiteEngineOptions,
  DAM,
  DAMError,
} from './dam/mod.ts';

// ============================================================================
// GUARDIAN MODULE - Type validation and guards
// ============================================================================
export {
  BaseGuardian,
  GuardianError,
  Guardian,
  ArrayGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  FunctionGuardian,
  NumberGuardian,
  ObjectGuardian,
  type ObjectSchema,
  StringGuardian,
  type FunctionParameters,
  type FunctionType,
  type GuardianProxy,
  type GuardianType,
  type MaybeAsync,
  type MergeParameters,
  type ResolvedValue,
  equals,
  getType,
  isIn,
  isNotIn,
  isPromiseLike,
  notEquals,
  optional,
  test,
} from './guardian/mod.ts';

// ============================================================================
// ID MODULE - Unique identifier generators
// ============================================================================
export {
  ALPHA_NUMERIC,
  ALPHA_NUMERIC_CASE,
  ALPHABETS,
  nanoID,
  NUMBERS,
  PASSWORD,
  WEB_SAFE,
  ObjectID,
  sequenceID,
  simpleID,
  getTimestamp,
  monotonicUlid,
  ulid,
} from './id/mod.ts';

// ============================================================================
// RESTLER MODULE - REST API client utilities
// ============================================================================
export {
  RESTlerConfigError,
  RESTlerError,
  RESTlerRequestError,
  RESTlerTimeoutError,
  type ResponseBody,
  type RESTlerContentType,
  type RESTlerContentTypePayload,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerMethod,
  type RESTlerMethodPayload,
  type RESTlerOptions,
  type RESTlerRequest,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTler,
} from './restler/mod.ts';

// ============================================================================
// SLOGGER MODULE - Structured logging utilities
// ============================================================================
export {
  compactFormat,
  defaultMaskingFormatter,
  detailedFormat,
  jsonFormatter,
  keyValueFormat,
  type MaskingConfig,
  maskingFormatter,
  MaskingStrategy,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
  AbstractHandler,
  BlackholeHandler,
  ConsoleHandler,
  type ConsoleHandlerOptions,
  FileHandler,
  type FileHandlerOptions,
  type HandlerOptions,
  HTTPHandler,
  type HTTPHandlerOptions,
  type SloggerFormatter,
  type SlogObject,
  type HandlerConfig,
  Slogger,
  type SloggerHandlerOption,
  type SloggerOptions,
  LogManager,
} from './slogger/mod.ts';

// ============================================================================
// UTILS MODULE - General utility functions
// ============================================================================
export type {
  DeepReadOnly,
  DeepWritable,
  ExcludeNever,
  FlattenEntity,
  MakeReadOnly,
  MakeRequired,
  Optional,
  Paths,
  PathValue,
  UnArray,
  UnionToIntersection,
} from './utils/mod.ts';

export {
  BaseError,
  type BaseErrorJson,
  assertLoadConfigOptions,
  Config,
  type ConfigType,
  loadConfig,
  type LoadConfigOptions,
  envArgs,
  type EventCallback,
  Events,
  getFreePort,
  expandIPv6,
  IPV4_MAX_SUBNET,
  IPV4_REGEX,
  IPV4_SEGMENT,
  ipv4ToBinary,
  ipv4ToHexSegments,
  ipv4ToLong,
  IPV6_MAX_SUBNET,
  IPV6_REGEX,
  IPV6_SEGMENT,
  ipv6ToBinary,
  isIPv4InRange,
  isValidIPv4,
  isValidIPv6Structure,
  isInSubnet,
  isPublicIP,
  isSubnet,
  Memoize,
  memoize,
  Once,
  once,
  type EventOptionKeys,
  Options,
  type PrivateObject,
  privateObject,
  Singleton,
  parse,
  stringify,
  SyslogFacilities,
  type SyslogFacility,
  type SyslogObject,
  SyslogSeverities,
  type SyslogSeverity,
  templatize,
  variableReplacer,
} from './utils/mod.ts';

// ============================================================================
// NAMESPACE EXPORTS for organized imports
// ============================================================================

/**
 * Caching utilities namespace
 * 
 * @example
 * ```typescript
 * import { CacherNS } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const cache = new CacherNS.RedisCacher(options);
 * ```
 */
export * as CacherNS from './cacher/mod.ts';

/**
 * Cryptographic utilities namespace
 * 
 * @example
 * ```typescript
 * import { Crypt } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const hash = await Crypt.sha256('data');
 * ```
 */
export * as Crypt from './crypt/mod.ts';

/**
 * Database Abstraction Manager namespace
 * 
 * @example
 * ```typescript
 * import { DAMNS } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * class MyEngine extends DAMNS.AbstractEngine { ... }
 * ```
 */
export * as DAMNS from './dam/mod.ts';

/**
 * Type validation and guards namespace
 * 
 * @example
 * ```typescript
 * import { Guardian } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const stringGuard = new Guardian.StringGuardian();
 * ```
 */
export * as GuardianNS from './guardian/mod.ts';

/**
 * Unique identifier generators namespace
 * 
 * @example
 * ```typescript
 * import { ID } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const id = ID.nanoID();
 * ```
 */
export * as ID from './id/mod.ts';

/**
 * REST API client utilities namespace
 * 
 * @example
 * ```typescript
 * import { RESTlerNS } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const client = new RESTlerNS.RESTler(config);
 * ```
 */
export * as RESTlerNS from './restler/mod.ts';

/**
 * Structured logging utilities namespace
 * 
 * @example
 * ```typescript
 * import { SloggerNS } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const logger = new SloggerNS.Slogger(config);
 * ```
 */
export * as SloggerNS from './slogger/mod.ts';

/**
 * General utility functions namespace
 * 
 * @example
 * ```typescript
 * import { Utils } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/mod.ts';
 * const config = new Utils.Config();
 * ```
 */
export * as Utils from './utils/mod.ts';

// ============================================================================
// VERSION INFORMATION
// ============================================================================

/**
 * TundraLibs version information
 */
export const VERSION = '1.0.0';

/**
 * TundraLibs package information
 */
export const PACKAGE_INFO = {
  name: 'TundraLibs',
  version: VERSION,
  description: 'A comprehensive collection of TypeScript/Deno utilities',
  author: 'TundraSoft',
  license: 'MIT',
  repository: 'https://github.com/TundraSoft/TundraLibs',
} as const;