/**
 * @fileoverview Type-only barrel behind the `@tundralibs/utils/types`
 * sub-path — the type half of the root `mod.ts`, re-exported without a
 * single runtime import.
 *
 * Two groups: the generic utility types that live in this folder, and
 * the types declared next to the implementation they describe
 * ({@link ConfigType}, {@link SyslogObject}, …). Both are `export type`,
 * so importing this module never loads `Config.ts` or its parsers.
 *
 * @module
 */

// Generic utility types — one per file in this folder.
export type { DeepReadOnly } from './DeepReadOnly.ts';
export type { DeepWritable } from './DeepWritable.ts';
export type { Entries } from './Entries.ts';
export type { ExcludeNever } from './ExcludeNever.ts';
export type { FlattenEntity } from './FlattenEntity.ts';
export type { Immutable } from './Immutable.ts';
export type { MakeReadOnly } from './MakeReadOnly.ts';
export type { MakeRequired } from './MakeRequired.ts';
export type { Mutable } from './Mutable.ts';
export type { OmitByType } from './OmitByType.ts';
export type { MakeOptional } from './MakeOptional.ts';
export type { Paths, PathValue } from './Path.ts';
export type { PickByType } from './PickByType.ts';
export type { Simplify } from './Simplify.ts';
export type { UnArray } from './UnArray.ts';
export type { UnionToIntersection } from './UnionToIntersection.ts';

// Types declared alongside their implementation. Kept in sync with the
// root `mod.ts` so both entry points expose the same type surface.
export type { BaseErrorJson } from '../BaseError.ts';
export type { ConfigType, LoadConfigOptions } from '../Config.ts';
export type { EventCallback } from '../Events.ts';
export type { EventOptionKeys } from '../Options.ts';
export type { PrivateObject } from '../privateObject.ts';
export type {
  StructuredDataKey,
  SyslogFacility,
  SyslogObject,
  SyslogSeverity,
} from '../syslog.ts';
