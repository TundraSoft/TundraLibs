/**
 * The Identity schema — accounts and their 1:1 profiles. Every other
 * schema in Shortly points here via entity-key FKs ('Users'), so
 * composing any of them without Identity fails loudly at use().
 *
 * @module
 */

import { Schema } from '../../../mod.ts';
import { Users } from './users.ts';
import { Profiles } from './profiles.ts';

export { Profiles, Users };

export const Identity = Schema('Identity', { Users, Profiles });
