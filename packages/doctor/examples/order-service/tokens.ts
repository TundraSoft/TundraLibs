/**
 * Typed labels for the values Doctor cannot `new`: they are stocked at
 * boot (`wiring.ts`) and injected anywhere — no class, no module
 * augmentation, and a test replaces them with `revoke` + `stock`.
 * @module
 */
import { label } from '../../mod.ts';

export type ServiceConfig = {
  readonly currency: string;
  /** Orders above this need a manual review — the optional feature. */
  readonly reviewAbove: number;
  readonly paymentApiKey: string;
};
export type Clock = { now(): Date };
/** Present only when reviews are enabled — consumers ask `Doctor.has`. */
export type Reviewer = { flag(orderId: string, amount: number): void };

export const CONFIG = label<ServiceConfig>('Config');
export const CLOCK = label<Clock>('Clock');
export const REVIEWER = label<Reviewer>('Reviewer');
