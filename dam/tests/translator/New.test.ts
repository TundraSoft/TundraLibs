import { assertEquals, assertThrows } from "../../../dev.dependencies.ts";
import { PostgresTranslator } from "../../clients/mod.ts";


Deno.test("Translator.insert should generate correct SQL query and parameters", () => {
  const translator = new Translator('mysql');
  const query = {
    type: 'INSERT',
    source: 'users',
    values: [
      {
        name: 'John Doe',
        age: 30,
      },
    ],
  };

  const result = translator.insert(query);

  assertEquals(result.sql, "INSERT INTO `users` (`name`, `age`) VALUES (:param1, :param2);");
  assertEquals(result.params, { param1: 'John Doe', param2: 30 });
});

Deno.test("Translator.insert should throw IncorrectType if the query object type is not 'INSERT'", () => {
  const translator = new Translator('mysql');
  const query = {
    type: 'UPDATE',
    source: 'users',
    data: {
      name: 'John Doe',
      age: 30,
    },
  };

  assertThrows(
    () => translator.insert(query),
    Error,
    "Incorrect query type. Expected 'INSERT', got 'UPDATE'"
  );
});

Deno.test("Translator.insert should throw MissingDefinition if a column specified in the insert values is not defined", () => {
  const translator = new Translator('mysql');
  const query = {
    type: 'INSERT',
    source: 'users',
    values: [
      {
        name: 'John Doe',
        age: 30,
        undefinedColumn: 'value',
      },
    ],
  };

  assertThrows(
    () => translator.insert(query),
    Error,
    "Missing column definition for 'undefinedColumn'"
  );
});



Deno.test("Translator.update should generate correct SQL query and parameters", () => {
  const translator = new PostgresTranslator();
  const query = {
    type: 'UPDATE',
    source: 'users',
    data: {
      name: 'John Doe',
      age: 30,
    },
    filters: {
      $and: [
        { $eq: ['$id', 1] },
      ],
    },
  };

  const result = translator.update(query);

  assertEquals(result.sql, "UPDATE `users` SET `name` = :param1, `age` = :param2 WHERE `id` = :param3;");
  assertEquals(result.params, { param1: 'John Doe', param2: 30, param3: 1 });
});

Deno.test("Translator.insert should throw IncorrectType if the query object type is not 'INSERT'", () => {
  const translator = new Translator('mysql');
  const query = {
    type: 'UPDATE',
    source: 'users',
    data: {
      name: 'John Doe',
      age: 30,
    },
  };

  assertThrows(
    () => translator.insert(query),
    Error,
    "Incorrect query type. Expected 'INSERT', got 'UPDATE'"
  );
});

Deno.test("Translator.insert should throw MissingDefinition if a column specified in the insert values is not defined", () => {
  const translator = new Translator('mysql');
  const query = {
    type: 'INSERT',
    source: 'users',
    values: [
      {
        name: 'John Doe',
        age: 30,
        undefinedColumn: 'value',
      },
    ],
  };

  assertThrows(
    () => translator.insert(query),
    Error,
    "Missing column definition for 'undefinedColumn'"
  );
});