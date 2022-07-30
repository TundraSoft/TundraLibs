import { Guardian, Struct, ValidationError } from "../mod.ts";
import type { Type } from "../mod.ts";

import { assertEquals, assertThrows } from "../../dev_dependencies.ts";

const userSchema = Struct({
  id: Guardian.number().gt(0).lte(100),
  name: Guardian.string().min(3),
  email: Guardian.string().email(),
  dob: Guardian.date().min(new Date("01-01-1975")),
  orders: [
    {
      id: Guardian.number().gt(0).lte(100),
      name: Guardian.string().min(3),
    },
  ],
});
type A = Type<typeof userSchema>;
const userSchemaPartial = Struct(
  {
    id: Guardian.number().gt(0).lte(100),
    name: Guardian.string().min(3),
    email: Guardian.string().email(),
    dob: Guardian.date().min(new Date("01-01-1975")),
    orders: [
      {
        id: Guardian.number().gt(0).lte(100),
        name: Guardian.string().min(3),
      },
    ],
  },
  undefined,
  "PARTIAL",
);

const userSchemaAny = Struct(
  {
    id: Guardian.number().gt(0).lte(100),
    name: Guardian.string().min(3),
    email: Guardian.string().email(),
    dob: Guardian.date().min(new Date("01-01-1975")),
    orders: [
      {
        id: Guardian.number().gt(0).lte(100),
        name: Guardian.string().min(3),
      },
    ],
  },
  undefined,
  "ANY",
);

const data: string[] = [];
data.push(JSON.stringify({
  id: 1,
  name: "Abhinav",
  email: "aaa@aaa.com",
  dob: new Date("01-01-1975"),
  orders: [
    {
      id: 1,
      name: "Order 1",
    },
  ],
}));
data.push(JSON.stringify({
  id: 10,
  name: "Abhinav",
  email: "adsf@gmail.com",
  dob: new Date("01-01-1975"),
}));
data.push(JSON.stringify({
  id: 1,
  name: "Abhinav",
  email: "aaa@aaa.com",
  dob: new Date("01-01-1975"),
  sex: "male",
  orders: [
    {
      id: 1,
      name: "Order 1",
    },
  ],
}));

/**
 * Check if option is initialized correctly (Typed)
 */
Deno.test({
  name: "Struct - Check strict mode",
  fn(): void {
    assertEquals(
      JSON.parse(JSON.stringify(userSchema(JSON.parse(data[0])))),
      JSON.parse(data[0]),
    );
    // Check error
    assertThrows(() => userSchema(JSON.parse(data[1])), ValidationError);
    // Passimg junk should throw error
    assertThrows(() => userSchema(JSON.parse(data[2])), ValidationError);
  },
});

/**
 * Partial Mode
 */
Deno.test({
  name: "Struct - Check partial mode",
  fn(): void {
    assertEquals(
      JSON.parse(JSON.stringify(userSchemaPartial(JSON.parse(data[0])))),
      JSON.parse(data[0]),
    );
    assertEquals(
      JSON.parse(JSON.stringify(userSchemaPartial(JSON.parse(data[1])))),
      JSON.parse(data[1]),
    );
    // Passimg junk should throw error
    assertThrows(() => userSchemaPartial(JSON.parse(data[2])), ValidationError);
  },
});

/**
 * Partial Mode
 */
Deno.test({
  name: "Struct - Check ANY mode",
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
