export { singleton } from './decorators/mod.ts';

export type {
  DeepReadOnly,
  DeepWritable,
  ExcludeNever,
  FlattenEntity,
  MakeOptional,
  MakeReadOnly,
  MakeRequired,
  UnArray,
  UnionToIntersection,
} from './types/mod.ts';

export { BaseError } from './BaseError.ts';
// export type { ErrorMetaTags } from './BaseError.ts';

export { envArgs } from './envArgs.ts';
export { getFreePort } from './getFreePort.ts';
export { privateObject } from './privateObject.ts';
export type { PrivateObject } from './privateObject.ts';

// export { TundraLibError } from './TundraLibError.ts';
// export type { TundraLibErrorMetaTags } from './TundraLibError.ts';
