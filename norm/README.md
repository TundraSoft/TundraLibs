# norm

NORM - Not an ORM is a simple db connectivity library which helps building fast
API. It is not meant to be a real ORM, but more of an abstraction layer which
helps in automation of generating queries for supported databases including some
complex filters.

This will never be meant for complex joins or complicated aggregations as in a
microservice api eco-systems these are rarely performed. If however there is a
need to do such operations, custom queries can be written.

## Supported Databases

- [x] PostgreSQL
- [ ] MySQL/MariaDB
- [x] SQLite
- [ ] MongoDB

## Usage

@TODO - Need to fill up documentation

```ts
// Standard no frills, connect query and move on

const test = newPostgresClient("test", {
  username: "**********",

  password: "**********",

  database: "APP_DB",

  port: 5432,

  host: "**********",

  tls: {

    enabled: true,

  },

});

await test.connect();

type testModal = {

  Id: string;

  Name: string;

  Check?: boolean;

  TimeStamp: Date;

};


const option: Partial<QueryOptions<testModal>> = {

  table: "test",

  schema: "CurrencyTracker",

  columns: {

    Id: "id",

    Name: "name",

    Check: "chk",

    TimeStamp: "tstamp",

  },

  primary: ["Id"],

};


const filter: Filters<testModal> = {

  Check: true,

  $or: [{

    Name: ";' select 1",

    Check: { $null: true },

  }, {

    Name: "sdf",

  }, {

    Check: true,

  }],

};


const insData: Array<Partial<testModal>> = [{

  Name: "dffdas",

  Check: true,

}, {

  Name: "sdfsdf",

}];


const delFilter: Filters<testModal> = {

  Id: {

      "b736ecb9-b0fc-40a1-be8f-c49339d15fac",
    ],

  },

};


const res = await test.select<testModal>(

  {

    ...option,

    ...{

      filters: filter,

      sort: { Name: "DESC" },

      paging: { size: 10, page: 1 },

    },

  } as QueryOptions<testModal>,

);

console.log(res);
```

### Types

#### ClientConfig

This is used to create a connection

```ts
type ClientConfig = {
  // The dialect

  dialect: Dialect;

  // The host

  host: string;

  // The port number

  port: number;

  // The username

  username: string;

  // The password

  password: string;

  // The database

  database: string;

  // Max Connection in the pool, defaults to 1 (no pool)

  pool: number;

  // TLS options

  tls: Partial<{
    enforce: boolean;

    enabled: boolean;

    ca: string[];
  }>;
};
```

#### QueryOptions

Used for querying.

NOTES:

- For Insert, Multiple Data (rows) can be passed. However ensure that the

  columns are consistent. This will return all inserted rows
- For Update, only one data record can be passed. However using filters multiple

  records can be updated. This will return all updated rows (even if column is

  not updated)
- For Delete, only filters need to be passed
- For Select, Filters, Paging and sorting can be passed. When using the "Model"

  class, paging is set to 10 by default.

```ts
type QueryOptions<T> = {
  // Table name

  table: string;

  // Schema name

  schema?: string;

  // Column names (for alias mapping)

  columns: Record<keyof T, string>;

  // PK

  primary?: Array<keyof T>;

  // Filters

  filters?: Filters<T>;

  // Paging

  paging?: QueryPagination;

  // Sort

  sort?: QuerySorting<T>;

  // Data used for insert or update

  data?: Array<Partial<T>>;
};
```

#### QueryResult

The default object used when returning data from query.

```ts
type QueryResult<T = Record<string, unknown>> = {
  // The type of Query

  type: QueryType;

  // Amount of time taken to run query

  time: number;

  // Total rows (in select with filter and paging, this ignores the paging value)

  totalRows?: number;

  // Pagination details

  paging?: {
    // Per page count

    size: number;

    // Page number

    page?: number;
  };

  // Sort options,

  sort?: QuerySorting<T>;

  // The rows (returned in Select, Insert and Update only)

  rows?: Array<T>;
};
```

## Model Definition

```ts
// Model Definition options
type ModelDefinition = {
  name: string; // Name of the model
  connection: string; // The connection config name
  schema?: string; // The schema name. This will be used as "Database" in mongodb
  table: string; // The table name
  isView?: boolean; // Is this a view? TODO - Query definition for generating views
  columns: {
    [key: string]: ModelColumnDefinition; // The key here is the Alias, real name is in the definition
  };
  // TODO - Not implemented
  audit?: {
    schema?: string;
    table: string;
  };
  encryptionKey?: string; // The encryption key (only required if there is an encrypted column)
  primaryKeys?: Set<string>; // List of primary keys (the alias must be used)
  uniqueKeys?: Record<string, Set<string>>; // List of unique keys (the alias must be used)
  // Foreign keys are only used for validation. Maybe add support to fetch result from related table?
  foreignKeys?: Record<string, { // FK relationship name
    model: string; // The model it refers to
    relationShip: Record<string, string>; // The join condition
    columns?: Set<string> | Record<string, DataType>; // The columns that are part of the foreign table (if blank, it will fetch from model)
  }>;
  permissions?: { // Permissions of the model, by default select, insert, update is set as true.
    select?: boolean; // Select from table
    insert?: boolean; // Insert into table
    update?: boolean; // Update table
    delete?: boolean; // Delete from table
    truncate?: boolean; // Truncate table
  };
  pageSize?: number; // Max rows per paging. Default to all
  seedFile?: string; // Seed file used when creating table
}

type ModelColumnDefinition = {
  type: DataType; // The data type
  length?: DataLength; // Length of the column (if applicable)
  isNullable?: boolean; // Can the column value be set as null
  defaults?: { // Insert & update default value (if null is passed)
    insert?:
      | Generators
      | GeneratorFunction
      | string
      | number
      | bigint
      | boolean
      | Date;
    update?:
      | Generators
      | GeneratorFunction
      | string
      | number
      | bigint
      | boolean
      | Date;
  name?: string; // The real name of the column
  notNullOnce?: boolean; // Can the value be set to null once set?
  disableUpdate?: boolean; // Disable updating this column
  // deno-lint-ignore no-explicit-any
  validation?: GuardianProxy<any>; // Validation protocol (Uses Guardian)
  security?: "ENCRYPT" | "HASH"; // Should the value be encrypted or hashed. NOTE - This will set data type to VARCHAR no matter what is defined.
  project?: boolean; // Select this column? (on select, insert and update)
}
```

## TODO

- [ ] Better documentation
- [ ] Driver(s) support
- [x] Finish Model to support validation and Generators
- [ ] Test suit
- [ ] Better error classes
- [x] Migrate away from polysql if there is no development there
- [x] Insert & Update with validation
- [x] Generator implementation
- [ ] Events
- [x] Foreign Key validation
- [x] ModelManager - Schema
  - [ ] Handle FK lookup
  - [x] Creation/sync of DB
- [x] Cleanup of model & clients (types etc)
