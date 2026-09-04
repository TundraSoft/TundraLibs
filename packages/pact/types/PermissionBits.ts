/**
 * Permission catalog: permission name → atomic bit. Every bit must be a
 * distinct single positive bit (enforced at construction); combinations
 * live in grants (a grant is a mask), never in the definition.
 */
export type PermissionBits = Record<string, bigint>;
