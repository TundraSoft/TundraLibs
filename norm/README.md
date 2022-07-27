# norm

NORM - Not an ORM is a simple db connectivity library which helps building fast

API. It is not meant to be a real ORM, but more of an abstraction layer which

helps in automation of generating queries for supported databases including some

complex filters.

This will never be meant for complex joins or complicated aggregations as in a

microservice api eco-systems these are rarely performed. If however there is a

need to do such operations, custom queries can be written.

## Supported Databases

- [X] PostgreSQL
- [ ] MySQL/MariaDB
- [X] SQLite
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

    $in: [

"3e85fcf5-b0a0-4110-a937-991aba25eb9e",

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

## ToDO

- [ ] Better documentation
- [ ] Driver(s) support
- [X] Finish Model to support validation and Generators
- [ ] Test suit
- [ ] Better error classes
- [ ] Migrate away from polysql if there is no development there
