/**
 * @fileoverview `label<T>(name)` — the typed handle for values stocked
 * with `Doctor.stock` and handed out by `inject(label)`.
 *
 * @module
 */

import type { Label } from './types/mod.ts';

/**
 * Make a typed {@link Label}: a name plus the type of what will be
 * stocked under it. The name is the key — two labels with the same
 * name address the same entry — and `T` travels only at compile time,
 * so `Doctor.stock(label, value)` and `inject(label)` are fully typed
 * with no module augmentation.
 *
 * @param name - The name to stock under; also what `inject('name')`
 *   and `Doctor.dispenseByName('name')` resolve.
 *
 * @example
 * ```ts
 * import { Doctor, inject } from '@tundralibs/doctor';
 *
 * type BlogDb = { repo(name: string): unknown };
 * declare const db: BlogDb;
 *
 * export const Db = label<BlogDb>('Db');
 * Doctor.stock(Db, db); // a ready-made value
 *
 * class Posts {
 *   db = inject(Db); // typed as BlogDb
 * }
 * ```
 */
export function label<T>(name: string): Label<T> {
  return { name };
}
