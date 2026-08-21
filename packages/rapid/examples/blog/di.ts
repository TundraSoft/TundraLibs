/**
 * Dependency wiring via `@tundralibs/doctor`. The modules pull the
 * database with `inject(NORM)` field initializers (see `BlogModule`), so
 * the label must be stocked BEFORE `app.modules()` constructs them. A
 * typed `label` keeps this import-free at the call site and needs no
 * module augmentation; tests stock a fake under the same label.
 *
 * @module
 */
import { Doctor, label } from '@tundralibs/doctor';
import type { Norm } from '@tundralibs/norm';

/** The connected `Norm` instance, stocked at boot. */
export const NORM = label<Norm>('Norm');

/** Bind the boot-time `Norm` instance to its label. */
export function registerBlogServices(norm: Norm): void {
  Doctor.stock(NORM, norm);
}
