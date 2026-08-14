import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { type Brand } from './Brand.ts';
import { Guardian } from '../Guardian.ts';

/**
 * Test suite for the Brand nominal-typing helper.
 *
 * Brand exists only in the type system, so most of its contract is
 * asserted at compile time: each `@ts-expect-error` below is a live
 * assertion, because an expect-error that stops catching an error is
 * itself a compile error. If the nominal guarantees ever weaken, these
 * fail to build rather than silently passing.
 */
describe('guardian.types.Brand', () => {
  describe('runtime transparency', () => {
    it('should leave a branded string usable as a plain string', () => {
      type UserId = Brand<string, 'UserId'>;
      const id: UserId = 'u_01HZY4' as UserId;

      asserts.assertEquals(typeof id, 'string');
      asserts.assertEquals(id.length, 8);
      asserts.assertEquals(id.toUpperCase(), 'U_01HZY4');
      asserts.assertEquals(id.slice(0, 2), 'u_');
    });

    it('should add no own property to a branded object', () => {
      const schema = { id: Guardian.string() };
      const plain = Guardian.object(schema).parse({ id: 'a_1' });
      const branded = Guardian.object(schema)
        .brand<'Account'>()
        .parse({ id: 'a_1' });

      // The phantom key is a `unique symbol` that is never assigned,
      // so a branded value must be indistinguishable at runtime.
      asserts.assertEquals(Object.keys(branded), Object.keys(plain));
      asserts.assertEquals(JSON.stringify(branded), JSON.stringify(plain));
      asserts.assertEquals(Object.getOwnPropertySymbols(branded).length, 0);
    });
  });

  describe('nominal typing', () => {
    it('should keep two brands over one base type distinct', () => {
      type UserId = Brand<string, 'UserId'>;
      type OrderId = Brand<string, 'OrderId'>;

      const user: UserId = 'u_1' as UserId;

      // @ts-expect-error - a UserId must never satisfy an OrderId
      const crossed: OrderId = user;

      asserts.assertEquals<string>(crossed, 'u_1');
    });

    it('should refuse an unbranded value of the base type', () => {
      type UserId = Brand<string, 'UserId'>;

      // @ts-expect-error - minting must go through parse() or a cast
      const raw: UserId = 'u_1';

      asserts.assertEquals<string>(raw, 'u_1');
    });

    it('should stay assignable to its own base type', () => {
      type UserId = Brand<string, 'UserId'>;
      const id: UserId = 'u_1' as UserId;

      // No cast needed: a brand is an intersection, so it *is* a string.
      const widened: string = id;

      asserts.assertEquals(widened, 'u_1');
    });
  });

  describe('minting through a guardian', () => {
    it('should hand back the branded type from parse()', () => {
      type Email = Brand<string, 'Email'>;
      const emails = Guardian.string().email().brand<'Email'>();

      // The annotation carries the assertion: parse() has to return
      // Brand<string,'Email'> already, with no cast at the call site.
      const minted: Email = emails.parse('user@example.com');

      asserts.assertEquals<string>(minted, 'user@example.com');
    });

    it('should keep separately branded guardians from mixing', () => {
      type OrderId = Brand<string, 'OrderId'>;
      const userIds = Guardian.string().brand<'UserId'>();

      // @ts-expect-error - a minted UserId must not satisfy an OrderId
      const wrong: OrderId = userIds.parse('u_1');

      asserts.assertEquals<string>(wrong, 'u_1');
    });
  });
});
