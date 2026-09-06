/**
 * Error taxonomy: message assembly (singular/plural), structured
 * context, cause chaining, and instanceof lineage for every class.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  NormDefinitionError,
  NormError,
  NormHookError,
  NormQueryError,
  NormUnsupportedError,
  NormValidationError,
} from './mod.ts';

describe('norm.errors (taxonomy)', () => {
  it('NormDefinitionError: singular/plural summaries, cause optional', () => {
    const one = new NormDefinitionError({
      issues: [{ model: 'M', path: 'columns.x', message: 'bad' }],
    });
    asserts.assertStringIncludes(
      one.message,
      'Invalid model definition (1 issue)',
    );
    asserts.assertStringIncludes(one.message, 'M.columns.x: bad');
    asserts.assertEquals(one.cause, undefined);

    const cause = new Error('root');
    const many = new NormDefinitionError({
      issues: [
        { model: 'M', path: 'a', message: 'x' },
        { model: 'M', path: 'b', message: 'y' },
      ],
    }, cause);
    asserts.assertStringIncludes(many.message, 'definitions (2 issues)');
    asserts.assertEquals(many.cause, cause);
    asserts.assertEquals(many.context.issues.length, 2);
    asserts.assertEquals(many instanceof NormError, true);
  });

  it('NormValidationError: summary lines, empty-issue fallback, cause', () => {
    const cause = new Error('guardian');
    const e = new NormValidationError({
      issues: [
        { model: 'Users', op: 'insert', path: 'email', message: 'invalid' },
        { model: 'Users', op: 'insert', path: 'role', message: 'not in lov' },
      ],
    }, cause);
    asserts.assertStringIncludes(
      e.message,
      'Users.insert: 2 validation issues',
    );
    asserts.assertStringIncludes(e.message, '  - role: not in lov');
    asserts.assertEquals(e.cause, cause);

    const empty = new NormValidationError({ issues: [] });
    asserts.assertStringIncludes(empty.message, '<unknown>.<unknown>');
    asserts.assertEquals(empty.cause, undefined);
  });

  it('NormUnsupportedError: with and without dialect, cause optional', () => {
    const plain = new NormUnsupportedError({ feature: 'transactions' });
    asserts.assertStringIncludes(plain.message, 'transactions');
    asserts.assertEquals(plain.cause, undefined);

    const dialected = new NormUnsupportedError(
      { feature: 'transactions', dialect: 'mongo' },
      new Error('why'),
    );
    asserts.assertStringIncludes(dialected.message, 'mongo');
    asserts.assertEquals((dialected.cause as Error).message, 'why');
    asserts.assertEquals(dialected.context.feature, 'transactions');
  });

  it('NormQueryError and NormHookError carry context + cause', () => {
    const q = new NormQueryError('bad filter', {
      entity: 'Users',
      subject: 'email',
    });
    asserts.assertEquals(q.message.includes('bad filter'), true);
    asserts.assertEquals(q.context.entity, 'Users');
    asserts.assertEquals(q.cause, undefined);
    const qc = new NormQueryError('x', { entity: 'U' }, new Error('inner'));
    asserts.assertEquals((qc.cause as Error).message, 'inner');

    const h = new NormHookError(
      { model: 'Users', hook: 'beforeInsert' },
      new Error('boom'),
    );
    asserts.assertStringIncludes(h.message, 'beforeInsert');
    asserts.assertEquals((h.cause as Error).message, 'boom');
    asserts.assertEquals(h instanceof NormError, true);
  });

  it('norm: context.norm prefixes the message; tagNorm stamps once', () => {
    const named = new NormQueryError('bad filter', {
      entity: 'Users',
      norm: 'billing',
    });
    asserts.assertEquals(named.norm, 'billing');
    asserts.assertEquals(named.message, '[billing] bad filter');

    const bare = new NormQueryError('bad filter', { entity: 'Users' });
    asserts.assertEquals(bare.norm, undefined);
    asserts.assertEquals(bare.message, 'bad filter');
    asserts.assertStrictEquals(bare.tagNorm('billing'), bare);
    asserts.assertEquals(bare.norm, 'billing');
    asserts.assertEquals(bare.message, '[billing] bad filter');
    asserts.assertEquals(
      bare.toJSON().formattedMessage,
      '[billing] bad filter',
    );
    bare.tagNorm('other'); // first stamp wins
    asserts.assertEquals(bare.norm, 'billing');
    asserts.assertEquals(bare.message, '[billing] bad filter');
  });
});
