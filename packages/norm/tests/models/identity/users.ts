/**
 * Users — accounts. Expression-default UUID pk, encrypted+hashed
 * email (uniqueness lives on the digest sibling, case-insensitive via
 * beforeWrite), encrypted-only apiKey, lov role, hidden+unfilterable
 * passwordHash, update pick-list, row hook, auto-touch updatedAt.
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).pattern(/^\S+@\S+\.\S+$/)
    .beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash()
    .comment('Sign-in identifier; encrypted at rest, unique via sibling'),
  apiKey: Column.varchar(256).encrypt(), // readable, never lookupable
  apiKeyHint: Column.mask('apiKey', (v) => `…${v.slice(-4)}`),
  role: Column.varchar(12).lov(['admin', 'editor', 'viewer'])
    .default('viewer'),
  displayName: Column.varchar(120).minLength(2)
    .afterRead((v) => v.trim()),
  passwordHash: Column.varchar(64).hidden().unfilterable(),
  pin: Column.hash('SHA-256').nullable(), // one-way digest, plaintext lookups
  loginCount: Column.integer().min(0).default(0),
  createdAt: Column.timestamp().default(() => new Date()),
  updatedAt: Column.timestamp().default(() => new Date())
    .defaultOnUpdate(() => new Date()),
}, {
  pk: ['id'],
  comment: 'Registered accounts',
  // Uniqueness of the ENCRYPTED email lives on its digest sibling —
  // declared here, emitted by the Migrator as a unique index.
  unique: { email: ['email_hash'] },
  // email/apiKey/createdAt are IMMUTABLE for callers (update scope);
  // updatedAt auto-touches from outside the scope.
  update: ['displayName', 'role', 'loginCount', 'passwordHash'],
  hooks: {
    beforeInsert: (row) => ({ ...row, displayName: row.displayName.trim() }),
  },
});
