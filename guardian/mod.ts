export type {
  GuardianProxy,
  MergeParameters,
  ResolvedValue,
  StructParameters,
  StructReturnType,
  StructValidatorFunction,
  Type,
} from "./types.ts";

export { Guardian } from "./Guardians/UnknownGuardian.ts";
export { objectGuard } from "./Guardians/ObjectGuardian.ts";
export { arrayGuard } from "./Guardians/ArrayGuardian.ts";
export { stringGuard } from "./Guardians/StringGuardian.ts";
export { numberGuard } from "./Guardians/NumberGuardian.ts";
export { bigintGuard } from "./Guardians/BigintGuardian.ts";
export { dateGuard } from "./Guardians/DateGuardian.ts";
export { booleanGuard } from "./Guardians/BooleanGuardian.ts";
export { Struct } from "./Guardians/StructGuardian.ts";

export { ValidationError } from "./Error.ts";
export type { ErrorList } from "./Error.ts";
