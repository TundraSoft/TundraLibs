/**
 * The Audit schema — a deliberately tiny schema whose single entity
 * depends on Identity cross-schema.
 *
 * @module
 */

import { Schema } from '../../../mod.ts';
import { AuditLog } from './audit-log.ts';

export { AuditLog };

export const Audit = Schema('Audit', { AuditLog });
