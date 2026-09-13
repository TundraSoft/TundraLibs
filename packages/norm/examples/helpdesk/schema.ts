/**
 * Entity definitions for the helpdesk example.
 *
 * Agents (login credentials via a salted digest), Tickets (SLA due
 * date computed by a hook, idempotent webhook ingestion via a unique
 * `ExternalRef`), and TicketNotes (a one-to-many activity log, with
 * two independent foreign keys onto the SAME target — Ticket and
 * Author both point elsewhere, so their `reverseAs` names must
 * differ). See `main.ts` for the runnable scenarios.
 *
 * @module
 */
import { Column, Entity, Schema } from '@tundralibs/norm';

// ─── Agents ─────────────────────────────────────────────────────────
//
// `PasswordHash` is a salted PBKDF2 digest — every hash is unique even
// for the same plaintext, so it is never filterable. Read the row,
// then verify the candidate with `pbkdf2Verify` (main.ts scenario 2).
// Contrast with the subscription-billing example's `Email`, which is
// `.encrypt().hash()` — reversible ciphertext plus a DETERMINISTIC
// digest sibling, chosen there because the app needs to look a
// customer up by email. A login credential must NOT be look-up-able
// by its hash, which is exactly what PBKDF2's per-hash salt buys.

export const Agents = Entity('agents', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  Name: Column.varchar(80),
  Email: Column.varchar(255),
  PasswordHash: Column.password('PBKDF2'),
}, {
  pk: ['Id'],
  unique: { Email: ['Email'] },
});

// ─── Tickets ────────────────────────────────────────────────────────
//
// - `ExternalRef` is the idempotency key an inbound webhook supplies
//   (main.ts scenario 3): `upsert()` against its unique index means
//   replaying the same webhook delivery is a no-op, not a duplicate
//   ticket.
// - `DueAt` is never supplied by the caller — the `beforeInsert` hook
//   derives it from `Priority` (an SLA clock), so it stays out of the
//   insert pick-list entirely.
// - `AssignedAgentId` is nullable and `onDelete: 'SET_NULL'`: removing
//   an agent un-assigns their open tickets instead of destroying them
//   (contrast with `TicketNotes.Ticket` below, which CASCADEs).
// - `defaultPageSize` bounds an unpaginated `find()` at 5 rows instead
//   of fetching the whole table (main.ts scenario 5).

export const Tickets = Entity('tickets', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  ExternalRef: Column.varchar(64),
  CustomerEmail: Column.varchar(255),
  Subject: Column.varchar(160),
  Priority: Column.enum(['low', 'normal', 'high', 'urgent']),
  Status: Column.enum(['open', 'pending', 'resolved', 'closed']).default(
    'open',
  ),
  AssignedAgentId: Column.uuid().nullable(),
  DueAt: Column.timestamp().nullable(),
  CreatedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  unique: { ExternalRef: ['ExternalRef'] },
  defaultPageSize: 5,
  fk: {
    AssignedAgent: {
      model: 'Agents',
      on: { AssignedAgentId: 'Id' },
      reverseAs: 'AssignedTickets',
      onDelete: 'SET_NULL',
    },
  },
  hooks: {
    beforeInsert: (row) => {
      const hours =
        ({ urgent: 2, high: 8, normal: 24, low: 72 } as Record<
          string,
          number
        >)[row.Priority as string] ?? 24;
      return { ...row, DueAt: new Date(Date.now() + hours * 3_600_000) };
    },
  },
});

// ─── TicketNotes ────────────────────────────────────────────────────
//
// One row per activity-log entry. `Internal` marks an agent-only note
// (never shown to the customer) versus a public reply.

export const TicketNotes = Entity('ticket_notes', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  TicketId: Column.uuid(),
  AuthorAgentId: Column.uuid().nullable(),
  Body: Column.text(),
  Internal: Column.boolean().default(false),
  CreatedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  fk: {
    Ticket: {
      model: 'Tickets',
      on: { TicketId: 'Id' },
      reverseAs: 'Notes',
      onDelete: 'CASCADE',
    },
    Author: {
      model: 'Agents',
      on: { AuthorAgentId: 'Id' },
      reverseAs: 'AuthoredNotes',
      onDelete: 'SET_NULL',
    },
  },
});

export const HelpdeskSchema = Schema('Helpdesk', {
  Agents,
  Tickets,
  TicketNotes,
});
