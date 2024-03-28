import { Guardian, GuardianError, Struct } from '../mod.ts';
import type { Type } from '../mod.ts';

import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('Guardian', () => {
  describe('Struct', () => {
    const userSchema = Struct({
      id: Guardian.number().gt(0).lte(100),
      name: Guardian.string().min(3),
      email: Guardian.string().email(),
      dob: Guardian.date().min(new Date('01-01-1975')),
      orders: Guardian.array().of(
        {
          id: Guardian.number().gt(0).lte(100),
          name: Guardian.string().min(3),
        },
      ).optional(),
    });
    type A = Type<typeof userSchema>;

    const userSchemaPartial = Struct(
      {
        id: Guardian.number().gt(0).lte(100),
        name: Guardian.string().min(3),
        email: Guardian.string().email(),
        dob: Guardian.date().min(new Date('01-01-1975')),
        orders: Guardian.array().of(
          {
            id: Guardian.number().gt(0).lte(100),
            name: Guardian.string().min(3),
          },
        ).optional(),
      },
      undefined,
      'DEFINED',
    );

    const userSchemaAny = Struct(
      {
        id: Guardian.number().gt(0).lte(100),
        name: Guardian.string().min(3),
        email: Guardian.string().email(),
        dob: Guardian.date().min(new Date('01-01-1975')),
        orders: Guardian.array().of(
          {
            id: Guardian.number().gt(0).lte(100),
            name: Guardian.string().min(3),
          },
        ).optional(),
      },
      undefined,
      'ALL',
    );

    const data: string[] = [];

    data.push(JSON.stringify({
      id: 1,
      name: 'Abhinav',
      email: 'aaa@aaa.com',
      dob: new Date('01-01-1975'),
      orders: [
        {
          id: 1,
          name: 'Order 1',
        },
      ],
    }));

    data.push(JSON.stringify({
      id: 10,
      name: 'Abhinav',
      email: 'adsf@gmail.com',
      dob: new Date('01-01-1975'),
    }));

    data.push(JSON.stringify({
      id: 1,
      name: 'Abhinav',
      email: 'aaa@aaa.com',
      dob: new Date('01-01-1975'),
      sex: 'male',
      orders: [
        {
          id: 1,
          name: 'Order 1',
        },
      ],
    }));

    /**
     * Check if option is initialized correctly (Typed)
     */
    it({
      name: 'Struct - Check STRICT mode',
      fn(): void {
        assertEquals(
          JSON.parse(JSON.stringify(userSchema(JSON.parse(data[0])))),
          JSON.parse(data[0]),
        );
        // Check error
        assertEquals(
          JSON.parse(JSON.stringify(userSchema(JSON.parse(data[1])))),
          JSON.parse(data[1]),
        );
        // Passimg junk should throw error
        assertThrows(() => userSchema(JSON.parse(data[2])), GuardianError);
      },
    });

    /**
     * Partial Mode
     */
    it({
      name: 'Struct - Check DEFINED mode',
      fn(): void {
        assertEquals(
          JSON.parse(JSON.stringify(userSchemaPartial(JSON.parse(data[0])))),
          JSON.parse(data[0]),
        );
        assertEquals(
          JSON.parse(JSON.stringify(userSchemaPartial(JSON.parse(data[1])))),
          JSON.parse(data[1]),
        );
        // Junk will be ignored
        const op = JSON.parse(data[2]);
        delete op['sex'];
        assertEquals(
          JSON.parse(JSON.stringify(userSchemaPartial(JSON.parse(data[2])))),
          op,
        );
        // assertThrows(() => userSchemaPartial(JSON.parse(data[2])), ValidationError);
      },
    });

    /**
     * ALL Mode
     */
    it({
      name: 'Struct - Check ALL mode',
      fn(): void {
        assertEquals(
          JSON.parse(JSON.stringify(userSchemaAny(JSON.parse(data[0])))),
          JSON.parse(data[0]),
        );
        assertEquals(
          JSON.parse(JSON.stringify(userSchemaAny(JSON.parse(data[1])))),
          JSON.parse(data[1]),
        );
        // Passimg junk should throw error
        assertEquals(
          JSON.parse(JSON.stringify(userSchemaAny(JSON.parse(data[2])))),
          JSON.parse(data[2]),
        );
      },
    });
  });
});
