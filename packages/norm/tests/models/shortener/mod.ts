/**
 * The Shortener schema — links, their visit stream, and the read-only
 * VIEW/QUERY kinds over them. Depends on Identity ('Users' entity
 * keys), which only resolves when both schemas meet at use().
 *
 * @module
 */

import { Schema } from '../../../mod.ts';
import { Links } from './links.ts';
import { Visits } from './visits.ts';
import { ActiveLinks, TopLinks } from './views.ts';

export { ActiveLinks, Links, TopLinks, Visits };

export const Shortener = Schema('Shortener', {
  Links,
  Visits,
  ActiveLinks,
  TopLinks,
});
