/**
 * AuditLog — lives in its OWN schema; the 'Users' entity key resolves
 * only when Audit meets Identity at use(). The live suite pins that
 * composing Audit without Identity fails loudly.
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const AuditLog = Entity('audit_log', {
  id: Column.integer(),
  actorId: Column.uuid(),
  action: Column.varchar(40).lov(['create', 'update', 'delete']),
  subject: Column.varchar(120),
}, {
  pk: ['id'],
  fk: {
    Actor: { model: 'Users', on: { actorId: 'id' }, reverseAs: 'Actions' },
  },
});
