/**
 * @fileoverview {@link RapidContextType} — the transport discriminator
 * carried as `ctx.type` (middleware narrow on it).
 *
 * @module
 */

/** The transport discriminator — `ctx.type`; middleware narrow on it. */
export type RapidContextType = 'HTTP' | 'SOCKET' | 'JOB';
