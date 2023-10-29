# norm

## Contents

- [Clients](#clients)
  - [SQLite](#sqlite)
    - [SQLiteClientOptions](#sqliteclientoptions)
  - [Postgres](#postgres)
    - [PostgresClientOptions](#postgresclientoptions)
  - [Maria DB](#mariadb)
    - [MariaClientOptions](#mariaclientoptions)

## Clients

By default all clients have below options:

```ts
type ClientOptions = {
  dialect: 'SQLITE' | 'POSTGRES' | 'MARIADB';
  encryptionKey?: string;
};
```

`dialect`: The dialect (client) for which configuration is being defined

`encryptionKey`: This is the encryption key which would be used for encrypting or decrypting values with this connection

### SQLite

#### SQLiteClientOptions

Below is the connection options for SQLite

```ts
type SQLiteClientOptions = {
  dialect: 'SQLITE';
  type: 'MEMORY' | 'FILE';
  mode: 'read' | 'write' | 'create';
  path?: string;
};
```

### Postgres

#### PostgresClientOptions

Below is the connection options for Postgres

```ts
type PostgresClientOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  connectionTimeout?: number;
  poolSize?: number;
  idleTimeout?: number;
};
```

### Maria DB

### MariaClientOptions

Below is the connection options for MariaDB

```ts
type MariaClientOptions = {
  dialect: 'MARIADB';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  connectionTimeout?: number;
  poolSize?: number;
  idleTimeout?: number;
};
```
