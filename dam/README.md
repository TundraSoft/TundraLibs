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

## Known issues:

- Translator errors need to standardized
- Expressions with column reference in insert will throw error (expected behaviour)
- SQLite to be tested
- MongoDB driver support is incomplete (joins and expressions)
- Handle SCHEMA for sqlite and figure work around for MongoDB join
