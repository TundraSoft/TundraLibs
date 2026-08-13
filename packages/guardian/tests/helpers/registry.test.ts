import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  BigIntGuardian,
  DateGuardian,
  DiscriminatedUnionGuardian,
  EnumGuardian,
  Guardian,
  GuardianError,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from '../../mod.ts';
import { resolveGuardian } from '../../helpers/mod.ts';

/**
 * Every cross-guard type transition — the methods that used to import a
 * sibling class as a VALUE and now resolve its constructor through the
 * registry. Each case asserts BOTH halves of the contract: the parsed
 * runtime value, and that the returned guardian is an instance of the
 * target class (which is what the registry indirection could silently
 * break without anyone noticing).
 */
describe('guardian.guards.registry', () => {
  describe('resolveGuardian', () => {
    it('hands back the registered constructor for every key', () => {
      asserts.assertStrictEquals(resolveGuardian('string'), StringGuardian);
      asserts.assertStrictEquals(resolveGuardian('number'), NumberGuardian);
      asserts.assertStrictEquals(resolveGuardian('date'), DateGuardian);
      asserts.assertStrictEquals(resolveGuardian('bigint'), BigIntGuardian);
    });

    it('throws a diagnosable error for an unregistered key', () => {
      // The defensive branch is unreachable through the package's public
      // entry points (every one of them evaluates the whole barrel), so
      // the key is forged to reach it. `as unknown as` rather than `any`
      // — the cast is confined to this assertion.
      const missing = 'not-a-guardian' as unknown as 'string';
      asserts.assertThrows(
        () => resolveGuardian(missing),
        GuardianError,
        "No guardian registered for 'not-a-guardian'",
      );
    });
  });

  describe('StringGuardian transitions', () => {
    it('toNumber() returns a NumberGuardian', () => {
      const guard = Guardian.string().toNumber();
      asserts.assertInstanceOf(guard, NumberGuardian);
      asserts.assertEquals(guard.parse('123.5'), 123.5);
      asserts.assertThrows(() => guard.parse('abc'), GuardianError);
    });

    it('toInt() returns a NumberGuardian', () => {
      const guard = Guardian.string().toInt();
      asserts.assertInstanceOf(guard, NumberGuardian);
      asserts.assertEquals(guard.parse('42'), 42);
      asserts.assertEquals(Guardian.string().toInt(16).parse('ff'), 255);
      asserts.assertThrows(() => guard.parse('12abc'), GuardianError);
    });

    it('toDate() returns a DateGuardian', () => {
      const guard = Guardian.string().toDate();
      asserts.assertInstanceOf(guard, DateGuardian);
      asserts.assertEquals(
        guard.parse('2023-06-15T00:00:00.000Z').toISOString(),
        '2023-06-15T00:00:00.000Z',
      );
      asserts.assertThrows(() => guard.parse('not a date'), GuardianError);
    });

    it('toBigInt() returns a BigIntGuardian', () => {
      const guard = Guardian.string().toBigInt();
      asserts.assertInstanceOf(guard, BigIntGuardian);
      asserts.assertEquals(guard.parse('12345'), 12345n);

      const hex = Guardian.string().toBigInt({ hex: true });
      asserts.assertInstanceOf(hex, BigIntGuardian);
      asserts.assertEquals(hex.parse('0xdeadbeef'), 3735928559n);
      asserts.assertThrows(() => guard.parse('nope'), GuardianError);
    });
  });

  describe('NumberGuardian transitions', () => {
    it('toString() returns a StringGuardian', () => {
      const guard = Guardian.number().toString();
      asserts.assertInstanceOf(guard, StringGuardian);
      asserts.assertEquals(guard.parse(123), '123');
      asserts.assertEquals(Guardian.number().toString(16).parse(255), 'ff');
    });

    it('toBigInt() returns a BigIntGuardian', () => {
      const guard = Guardian.number().toBigInt();
      asserts.assertInstanceOf(guard, BigIntGuardian);
      asserts.assertEquals(guard.parse(123), 123n);
      asserts.assertThrows(() => guard.parse(3.14), GuardianError);
    });

    it('toDate() returns a DateGuardian', () => {
      const guard = Guardian.number().toDate();
      asserts.assertInstanceOf(guard, DateGuardian);
      asserts.assertEquals(
        guard.parse(0).toISOString(),
        '1970-01-01T00:00:00.000Z',
      );
    });

    it('formatCurrency() / addCommas() / padZeros() return StringGuardians', () => {
      const currency = Guardian.number().formatCurrency();
      asserts.assertInstanceOf(currency, StringGuardian);
      asserts.assertEquals(typeof currency.parse(1234.5), 'string');

      const commas = Guardian.number().addCommas();
      asserts.assertInstanceOf(commas, StringGuardian);
      asserts.assertEquals(commas.parse(1234567), '1,234,567');

      const padded = Guardian.number().padZeros(4);
      asserts.assertInstanceOf(padded, StringGuardian);
      asserts.assertEquals(padded.parse(42), '0042');
      asserts.assertEquals(padded.parse(-42), '-0042');
    });
  });

  describe('DateGuardian transitions', () => {
    const AT = new Date('2023-06-15T10:20:30.000Z');

    it('format() returns a StringGuardian', () => {
      const guard = Guardian.date().format('yyyy-MM-dd');
      asserts.assertInstanceOf(guard, StringGuardian);
      asserts.assertEquals(guard.parse(new Date(2023, 5, 15)), '2023-06-15');
      // The inherited `date-time` format hint is dropped — an arbitrary
      // pattern can't claim it.
      asserts.assertEquals(guard.toOpenAPI().format, undefined);
      asserts.assertEquals(guard.toOpenAPI().type, 'string');
    });

    it('toISOString() returns a StringGuardian', () => {
      const guard = Guardian.date().toISOString();
      asserts.assertInstanceOf(guard, StringGuardian);
      asserts.assertEquals(guard.parse(AT), '2023-06-15T10:20:30.000Z');
    });

    it('toTimestamp() / toUnixTimestamp() return NumberGuardians', () => {
      const ms = Guardian.date().toTimestamp();
      asserts.assertInstanceOf(ms, NumberGuardian);
      asserts.assertEquals(ms.parse(AT), AT.getTime());
      asserts.assertEquals(ms.toOpenAPI().type, 'number');
      asserts.assertEquals(ms.toOpenAPI().format, undefined);

      const secs = Guardian.date().toUnixTimestamp();
      asserts.assertInstanceOf(secs, NumberGuardian);
      asserts.assertEquals(secs.parse(AT), Math.floor(AT.getTime() / 1000));
    });

    it('component() returns a NumberGuardian', () => {
      const year = Guardian.date().component('year');
      asserts.assertInstanceOf(year, NumberGuardian);
      asserts.assertEquals(year.parse(new Date(2023, 5, 15)), 2023);

      const month = Guardian.date().component('month');
      asserts.assertInstanceOf(month, NumberGuardian);
      asserts.assertEquals(month.parse(new Date(2023, 5, 15)), 6);
    });
  });

  describe('BigIntGuardian transitions', () => {
    it('toNumber() returns a NumberGuardian', () => {
      const guard = Guardian.bigint().toNumber();
      asserts.assertInstanceOf(guard, NumberGuardian);
      asserts.assertEquals(guard.parse(123n), 123);
      asserts.assertThrows(
        () => guard.parse(BigInt(Number.MAX_SAFE_INTEGER) + 10n),
        GuardianError,
      );
    });

    it('toHex() / toBinary() / toOctal() / toString() return StringGuardians', () => {
      const hex = Guardian.bigint().toHex();
      asserts.assertInstanceOf(hex, StringGuardian);
      asserts.assertEquals(hex.parse(255n), 'ff');

      const bin = Guardian.bigint().toBinary();
      asserts.assertInstanceOf(bin, StringGuardian);
      asserts.assertEquals(bin.parse(5n), '101');

      const oct = Guardian.bigint().toOctal();
      asserts.assertInstanceOf(oct, StringGuardian);
      asserts.assertEquals(oct.parse(8n), '10');

      const str = Guardian.bigint().toString();
      asserts.assertInstanceOf(str, StringGuardian);
      asserts.assertEquals(str.parse(42n), '42');
      asserts.assertThrows(
        () => Guardian.bigint().toString(99).parse(42n),
        GuardianError,
      );
    });
  });

  describe('BooleanGuardian transitions', () => {
    it('toString() returns a StringGuardian', () => {
      const guard = Guardian.boolean().toString();
      asserts.assertInstanceOf(guard, StringGuardian);
      asserts.assertEquals(guard.parse(true), 'true');
      asserts.assertEquals(guard.parse(false), 'false');
    });

    it('toNumber() returns a NumberGuardian', () => {
      const guard = Guardian.boolean().toNumber();
      asserts.assertInstanceOf(guard, NumberGuardian);
      asserts.assertEquals(guard.parse(true), 1);
      asserts.assertEquals(guard.parse(false), 0);
    });
  });

  describe('ArrayGuardian transitions', () => {
    it('flatten() returns a StringGuardian', () => {
      const guard = Guardian.array().flatten();
      asserts.assertInstanceOf(guard, StringGuardian);
      asserts.assertEquals(guard.parse([1, [2, 3], 4]), '1,2,3,4');
    });

    it('sum() / average() / min() / max() return NumberGuardians', () => {
      const sum = Guardian.array(Guardian.number()).sum();
      asserts.assertInstanceOf(sum, NumberGuardian);
      asserts.assertEquals(sum.parse([1, 2, 3]), 6);

      const avg = Guardian.array(Guardian.number()).average();
      asserts.assertInstanceOf(avg, NumberGuardian);
      asserts.assertEquals(avg.parse([2, 4, 6]), 4);

      const min = Guardian.array(Guardian.number()).min();
      asserts.assertInstanceOf(min, NumberGuardian);
      asserts.assertEquals(min.parse([3, 1, 2]), 1);

      const max = Guardian.array(Guardian.number()).max();
      asserts.assertInstanceOf(max, NumberGuardian);
      asserts.assertEquals(max.parse([3, 1, 2]), 3);
    });
  });

  describe('UnknownGuardian transitions', () => {
    it('toStringValue() returns a StringGuardian', () => {
      const guard = Guardian.unknown().toStringValue();
      asserts.assertInstanceOf(guard, StringGuardian);
      asserts.assertEquals(guard.parse(42), '42');
      asserts.assertEquals(guard.parse({ name: 'John' }), '{"name":"John"}');
    });
  });

  describe('Object / Enum / DiscriminatedUnion cross-guard construction', () => {
    it('ObjectGuardian.keyOf() returns an EnumGuardian over the keys', () => {
      const guard = Guardian.object({
        id: Guardian.number(),
        name: Guardian.string(),
      }).keyOf();
      asserts.assertInstanceOf(guard, EnumGuardian);
      asserts.assertEquals(guard.parse('id'), 'id');
      asserts.assertEquals(guard.parse('name'), 'name');
      asserts.assertThrows(() => guard.parse('nope'), GuardianError);
    });

    it('discriminatedUnion() builds over ObjectGuardian branches keyed by EnumGuardian', () => {
      const guard = Guardian.discriminatedUnion('kind', [
        Guardian.object({
          kind: Guardian.literal('circle'),
          radius: Guardian.number(),
        }),
        Guardian.object({
          kind: Guardian.literal('square'),
          side: Guardian.number(),
        }),
      ]);
      asserts.assertInstanceOf(guard, DiscriminatedUnionGuardian);
      asserts.assertEquals(guard.parse({ kind: 'circle', radius: 2 }), {
        kind: 'circle',
        radius: 2,
      });
      asserts.assertThrows(
        () => guard.parse({ kind: 'triangle', base: 1 }),
        GuardianError,
      );
    });
  });

  describe('immutable-builder semantics survive the indirection', () => {
    it('a transition returns a NEW instance and leaves the source alone', () => {
      const source = Guardian.string().minLength(1);
      const derived = source.toNumber();

      asserts.assertNotStrictEquals<unknown>(derived, source);
      asserts.assertInstanceOf(source, StringGuardian);
      asserts.assertInstanceOf(derived, NumberGuardian);
      // The source still parses as a string — the transition did not
      // mutate it.
      asserts.assertEquals(source.parse('7'), '7');
      asserts.assertEquals(derived.parse('7'), 7);
    });

    it('chained transitions keep crossing classes correctly', () => {
      const roundTrip = Guardian.string().toNumber().toBigInt().toString();
      asserts.assertInstanceOf(roundTrip, StringGuardian);
      asserts.assertEquals(roundTrip.parse('42'), '42');

      const stamp = Guardian.string().toDate().toTimestamp();
      asserts.assertInstanceOf(stamp, NumberGuardian);
      asserts.assertEquals(
        stamp.parse('1970-01-01T00:00:01.000Z'),
        1000,
      );
    });

    it('Guardian.infer<> still resolves through a transition', () => {
      const schema = Guardian.object({
        age: Guardian.string().toNumber(),
        at: Guardian.string().toDate(),
      });
      type Parsed = Guardian.infer<typeof schema>;
      const value: Parsed = schema.parse({
        age: '30',
        at: '2023-06-15T00:00:00.000Z',
      });
      // Compile-time proof the inferred members are number / Date, plus
      // the runtime check.
      const age: number = value.age;
      const at: Date = value.at;
      asserts.assertEquals(age, 30);
      asserts.assertInstanceOf(at, Date);
    });
  });

  it('every guard reachable from the barrel is instantiable', () => {
    // A registration that failed to run would surface as a resolve
    // failure on the first transition — assert the whole set eagerly.
    asserts.assertInstanceOf(Guardian.string(), StringGuardian);
    asserts.assertInstanceOf(Guardian.number(), NumberGuardian);
    asserts.assertInstanceOf(Guardian.date(), DateGuardian);
    asserts.assertInstanceOf(Guardian.bigint(), BigIntGuardian);
    asserts.assertInstanceOf(Guardian.object({}), ObjectGuardian);
  });
});
