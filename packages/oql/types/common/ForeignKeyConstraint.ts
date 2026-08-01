import type { ForeignKeyAction } from './ForeignKeyAction.ts';
import type { TableType } from './TableType.ts';

/**
 * Foreign-key constraint definition — relationship between columns
 * in two tables for referential integrity.
 *
 * @template T - Table schema type.
 *
 * @example Simple foreign key
 * ```ts
 * const fk: ForeignKeyConstraint<{ userId: number }> = {
 *   columns: ['userId'],
 *   references: { table: 'users', columns: ['id'] },
 *   onDelete: 'CASCADE',
 *   onUpdate: 'CASCADE',
 * };
 * ```
 *
 * @example Composite foreign key
 * ```ts
 * const composite: ForeignKeyConstraint<{ tenantId: number; userId: number }> = {
 *   columns: ['tenantId', 'userId'],
 *   references: { table: 'users', schema: 'public', columns: ['tenantId', 'id'] },
 *   onDelete: 'CASCADE',
 * };
 * ```
 */
export type ForeignKeyConstraint<T extends TableType = TableType> = {
  /** Column(s) in the current table that reference another table. */
  columns: Array<keyof T>;
  /** Referenced table and columns. */
  references: {
    /** Name of the referenced table. */
    table: string;
    /** Optional schema/namespace of the referenced table. */
    schema?: string;
    /** Column(s) in the referenced table (usually primary key). */
    columns: string[];
  };
  /** Action to take when the referenced row is deleted. */
  onDelete?: ForeignKeyAction;
  /** Action to take when the referenced row is updated. */
  onUpdate?: ForeignKeyAction;
};
