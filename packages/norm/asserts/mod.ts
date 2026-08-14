/**
 * @module
 *
 * Norm asserts — the OQL-asserts counterpart for norm definitions.
 * ONE implementation of every structural rule: `Entity()`, `use()`
 * and `compileRuntime()` all delegate here, and hand-built
 * definitions can be validated with the same functions:
 *
 * ```ts ignore
 * import { assertDefinition } from '@tundralibs/norm/asserts';
 * assertDefinition(myHandBuiltDef); // NormDefinitionError on issues
 * ```
 *
 * @since 1.0.0
 */

export { assertColumnSpec, columnSpecIssues } from './column.ts';
export { assertDefinition, definitionIssues } from './definition.ts';
export { assertRegistry, type RegistryAssertOptions } from './registry.ts';
