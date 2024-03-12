# DAM - Database Abstraction & Management

This library is the result of months of damn, whay wont this db client do that. Written on a weekend
over a bottle of rum, there be bugs you never dreamed of.

The main goal behind DAM is to provide cross database connectivity and abstraction of sql queries without
the bloatware of ORM.

Currently DAM supports:

- Postgres
- MariaDB
- SQLite
- MongoDB

There are few restrictions in SQLite and MongoDB as listed below:

- Creation of Schema is not possible in MongoDB and SQLite. Although we can create database (like in mariadb) in
  mongodb, there is the issue of joining across db hence it is disabled.
- Although MariaDB is supported, MySQL is _NOT_ as RETURNING is not supported.

## Usage

### DAM

DAM class is provided as a simple utility to manage connections. Connections can be defined and the instance
of the connection fetched on demand.

```ts
import { DAM } from 'dam/mod.ts';

DAM.addConfig('Connection1', { dialect: 'POSTGRES', ...}): void;

const conn = DAM.getClient('Connection1'); //Gets the connection
```

#### addConfig

Adds a new connection configuration to the connection list.

Arguments:

`name: string` - The connection name. _Note_ Not case sensitive

`config: ClientOptions` - The connection options

#### getClient

Gets the client class. It checks if the client has been initialized, if so returns the instance, else
initializes the client class and returns the instance.

Arguments:

`name: string` - The connection name.

#### hasConfig

Checks if config is present

Arguments:

`name: string` - The connection name. _Note_ Not case sensitive

#### register

Internal function called by AbstractClient to register the class initialization.

Arguments:

`client: AbstractClient` - The instance of the client.

### Client Connection

#### ClientOptions

```ts
export type ClientOptions = {
  dialect: Dialects;
  slowQueryThreshold?: number;
};
```

`dialect: Dialects` - The dialect

`slowQueryThreshold` - Time in seconds after which a query is considered as slow running. The event 'slowquery' is triggered. _NOTE_ This will not stop the query!

##### Postgres

Below is the connection options available for Postgres connection

```ts
export type PostgresOptions = ClientOptions & {
  dialect: 'POSTGRES';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  poolSize?: number;
  tls?: {
    enabled: boolean;
    certificates?: string[];
    verify?: boolean;
  };
};
```

`host: string` - The hostname/ip of the database

`port?: number` - The port where db is listening. Defaults to 5432

`username: string` - Username to use for connecting

`password: string` - Password to use for connecting

`database: string` - The database name

`poolSize: number` - Pool size for the connection. Defaults to 50

`tls.enabled: boolean` - Enable TLS?

`tls.certificate: string` - The Certificate. Provide full chain as array of string

`tls.verify: boolean` - Verify the certificate

##### Maria

Below is the connection options available for MariaDB connection

```ts
export type MariaOptions = ClientOptions & {
  dialect: 'MARIA';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  poolSize?: number;
  tls?: {
    enabled: boolean;
    certificates?: string[];
    verify?: boolean;
  };
};
```

`host: string` - The hostname/ip of the database

`port?: number` - The port where db is listening. Defaults to 5432

`username: string` - Username to use for connecting

`password: string` - Password to use for connecting

`database: string` - The database name

`connectionTimeout?: number` -

`idleTimeout?: number` -

`poolSize: number` - Pool size for the connection. Defaults to 50

`tls.enabled: boolean` - Enable TLS?

`tls.certificate: string` - The Certificate. Provide full chain as array of string

`tls.verify: boolean` - Verify the certificate

##### SQLite

```ts
export type SQLiteOptions = ClientOptions & {
  dialect: 'SQLITE';
  mode: 'MEMORY' | 'FILE';
  path?: string;
};
```

`mode: 'MEMORY' | 'FILE'` - memory mode or use file mode

`path?: string` - The path where the files are to be created. Required only for FILE mode.

##### Mongo

### Translator

AbstractTranslator is a helper class which helps building SQL queries. This is available only for Maria, Postgres and SQLite.

Below types are used to generate the queries -

#### Create Schema

```ts
export type CreateSchemaQuery = {
  type: 'CREATE_SCHEMA';
  schema: string;
};
```

#### Drop Schema

```ts
export type DropSchemaQuery = {
  type: 'DROP_SCHEMA';
  schema: string;
  cascade?: boolean;
};
```

#### Create Table

```ts
export type CreateTableQuery = {
  type: 'CREATE_TABLE';
  source: string;
  schema?: string;
  columns: Record<string, CreateTableColumnDefinition>;
  primaryKeys?: string[];
  uniqueKeys?: Record<string, string[]>;
  foreignKeys?: Record<
    string,
    Pick<JoinSegment, 'schema' | 'source' | 'relation'>
  >;
};

export type CreateTableColumnDefinition = {
  type: DataTypes;
  nullable?: boolean;
  length?: [number, number?];
};
```

#### Drop Table

```ts
export type DropTableQuery = {
  type: 'DROP_TABLE';
  source: string;
  schema?: string;
};
```

#### Create View

```ts
export type CreateViewQuery = {
  type: 'CREATE_VIEW';
  source: string;
  schema?: string;
  materialized?: boolean;
  query: SelectQuery;
};
```

#### Drop View

```ts
export type DropViewQuery = {
  type: 'DROP_VIEW';
  source: string;
  schema?: string;
  materialized?: boolean;
};
```

#### Insert

```ts
export type InsertQuery = {
  type: 'INSERT';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  values: Record<string, unknown>[];
  project: Record<
    string,
    ColumnIdentifier | Expressions | string | number | boolean | Date
  >;
};
```

#### Update

```ts
export type UpdateQuery = {
  type: 'UPDATE';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  data: Record<string, unknown>;
  filters?: Record<string, unknown>;
};
```

#### Delete

```ts
export type DeleteQuery = {
  type: 'DELETE';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  filters?: Record<string, unknown>;
};
```

#### Select

```ts
export type SelectQuery = {
  type: 'SELECT';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  filters?: QueryFilters;
  project: Record<
    string,
    | ColumnIdentifier
    | Expressions
    | Aggregate
    | string
    | number
    | boolean
    | Date
  >;
  joins?: Record<string, JoinSegment>;
  groupBy?: ColumnIdentifier[];
  orderBy?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
  limit?: number;
  offset?: number;
};
```

#### Count

```ts
export type CountQuery = {
  type: 'COUNT';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  filters?: QueryFilters;
  joins?: Record<string, JoinSegment>;
};
```

#### Truncate

```ts
export type TruncateQuery = {
  type: 'TRUNCATE';
  source: string;
  schema?: string;
};
```

## Limitations:

- [ ] Alter Table and Alter view to be supported for migration
- [ ] JSON Filtering can be improved (example check if particular JSON entry exists in array etc)
- [ ] Translator beautify can be improved
- [ ] Transaction support
- [ ] Expressions with column reference in insert will throw error (expected behaviour)
- [ ] MongoDB driver support is incomplete (joins and expressions)

### Postgres

- JSONB is used by default as there are some issues when using base JSON column type (using JSON column in group by causes issues)

### SQLite

- CREATE SCHEMA - Create SCHEMA is only supported in FILE mode and not in memory mode. This is because SQLite
  does not support schema. What happens is we create a new database and attaches the same to the connection.
- DROP SCHEMA - Same as CREATE SCHEMA. On drop the file is deleted and hence non recoverable
- TRUNCATE - Truncate table is NOT supported, hence delete statement without filter is generated
- CONSTRAINS - Currently create table generates 2 sql statements. One with table definition and another with foreign keys. SQLite does not support this.
- Expression UUID is very hacky. Will need to move it to crypto.randomUUID()

### Maria

- Only supports MARIA and not MySQL

### Mongo

- Joins are supported only on tables within the same "database"/"schema".
- Expressions, Aggregations and Expressions in filter not implemented.
