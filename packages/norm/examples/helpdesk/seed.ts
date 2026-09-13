/**
 * Agent credentials for the helpdesk example. Plaintext here purely so
 * `main.ts` has something to hash on insert and verify on login — a
 * real app never keeps a plaintext password anywhere but the login
 * request itself.
 *
 * @module
 */

export const AGENTS = [
  { Name: 'Priya Shah', Email: 'priya@helpdesk.dev', password: 'hunter2boat' },
  { Name: 'Sam Ortiz', Email: 'sam@helpdesk.dev', password: 'correct-horse' },
] as const;
