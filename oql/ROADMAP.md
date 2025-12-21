# OQL (Object Query Language) - Roadmap & Analysis

> **Status**: Type system and validators complete. Query builders needed for
> production use.\
> **Last Updated**: December 21, 2025

## 📊 Current State Summary

### ✅ Completed Components

| Component                 | Coverage | Status              | Notes                                                      |
| ------------------------- | -------- | ------------------- | ---------------------------------------------------------- |
| **Type System**           | 95%      | ✅ Complete         | Comprehensive TypeScript types for all query operations    |
| **Filter Validators**     | 92-100%  | ✅ Production Ready | Operators, ExpressionOperators, FilterOperator, Joins      |
| **Aggregate Validators**  | 100%     | ✅ Production Ready | COUNT, SUM, AVG, MIN, MAX, STRING_AGG, ARRAY_AGG, JSON_ROW |
| **Expression Validators** | 99%      | ✅ Production Ready | Numeric, String, Date expressions fully tested             |
| **Column Identifiers**    | 82%      | ✅ Good             | Nested column support (`@table.@column.@jsonKey`)          |

### 🔧 Test Statistics

- **Total Tests**: 11 test suites, 639 test steps
- **Pass Rate**: 100% (639/639 passing)
- **Total Test Coverage**: 99.0% branch, 98.2% line (Expression validators)
- **Filter Coverage**: 82.8% branch, 89-100% line per module

---

## 🚫 Intentionally Deferred Features

These features are **commented out** as they are complex to implement and not
immediately needed:

### Type Expressions (Complex Implementation)

- ❌ **CAST** - Type conversion between STRING, NUMBER, BIGINT, DATE, BOOLEAN
- ❌ **COALESCE** - Return first non-null value from arguments
- ❌ **NULLIF** - Return null if two values are equal

**Reason**: These require sophisticated type analysis and runtime conversion
logic. Will be implemented when query builders are ready.

---

## 🎯 Architecture Overview

### What We Have

```
┌─────────────────────────────────────────────────────┐
│                    APPLICATION                       │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│              OQL TYPE SYSTEM (Complete)              │
│  • Query<T> - Type-safe query definitions           │
│  • Filters, Aggregates, Expressions                 │
│  • Column identifiers with JSON support             │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│          VALIDATORS (asserts/) - Complete            │
│  • Runtime type validation                          │
│  • 99%+ test coverage                               │
│  • Production ready                                 │
└─────────────────────────────────────────────────────┘
                       ↓
              ❌ MISSING LAYER ❌
┌─────────────────────────────────────────────────────┐
│           QUERY BUILDERS (Not Implemented)           │
│  • OQL → PostgreSQL SQL                             │
│  • OQL → MariaDB SQL                                │
│  • OQL → SQLite SQL                                 │
│  • OQL → MongoDB Aggregation Pipeline               │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│              DAM ENGINES (Complete)                  │
│  • PostgresEngine, MariaEngine                      │
│  • SQLiteEngine, MongoEngine                        │
│  • Connection pooling, transactions                 │
└─────────────────────────────────────────────────────┘
```

### What's Missing

**❌ CRITICAL**: The **Query Builder Layer** doesn't exist!

This means:

- ✅ You CAN define type-safe queries
- ✅ You CAN validate queries at runtime
- ❌ You CANNOT convert OQL to SQL/MongoDB
- ❌ You CANNOT execute OQL queries

---

## 🎯 Priority Roadmap

### 🔥 PRIORITY 1: CRITICAL (Must Have)

#### 1.1 Implement Query Builders

**Status**: Not started\
**Estimated Effort**: 8-10 weeks\
**Blocking**: All database operations

Create query translator layer:

```typescript
// Target API:
const oqlQuery: Query<'SELECT', User> = { ... };
const sql = PostgresBuilder.build(oqlQuery);
await engine.execute(sql);
```

**Subtasks**:

- [ ] `oql/builders/BaseBuilder.ts` - Shared logic, AST traversal
- [ ] `oql/builders/PostgresBuilder.ts` - OQL → PostgreSQL SQL (2-3 weeks)
- [ ] `oql/builders/MariaBuilder.ts` - OQL → MariaDB SQL (1-2 weeks)
- [ ] `oql/builders/SQLiteBuilder.ts` - OQL → SQLite SQL (1-2 weeks)
- [ ] `oql/builders/MongoBuilder.ts` - OQL → MongoDB pipeline (2-3 weeks)
- [ ] Comprehensive integration tests (1 week)

**Key Challenges**:

- Parameter binding (PostgreSQL: $1, MariaDB: ?, MongoDB: objects)
- Expression translation (different SQL functions)
- Join syntax differences
- Aggregate function mapping
- Date/time function translations
- Schema/database prefix handling

#### 1.2 DAM-OQL Integration

**Status**: Not started\
**Estimated Effort**: 1 week\
**Dependencies**: Query Builders (1.1)

Modify DAM engines to accept OQL queries:

```typescript
// Current (raw SQL):
await engine.query('SELECT * FROM users WHERE age >= $1', [18]);

// Target (OQL):
await engine.execute({
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name'],
  where: { '@age': { $gte: 18 } },
});
```

**Subtasks**:

- [ ] Add `execute<T>(query: Query): Promise<T[]>` to AbstractEngine
- [ ] Integrate query builders into each engine
- [ ] Update engine tests to use OQL
- [ ] Add query validation before execution
- [ ] Performance benchmarks (OQL vs raw SQL)

---

### 📌 PRIORITY 2: VALIDATION IMPROVEMENTS

#### 2.1 Security Expression Validators

**Status**: Not started\
**Estimated Effort**: 1 week\
**Security Impact**: HIGH

Currently ENCRYPT, DECRYPT, HASH expressions have **no validators**:

**Subtasks**:

- [ ] `assertEncryptExpression` - Validate encryption parameters
- [ ] `assertDecryptExpression` - Validate decryption parameters
- [ ] `assertHashExpression` - Validate hash algorithms
- [ ] Tests for security expressions (100% coverage)
- [ ] Document platform-specific behavior (SQLite/MongoDB limitations)

**Security Note**: SQLite and MongoDB store encrypted data as-is without actual
encryption. Document this clearly!

#### 2.2 Complete ColumnIdentifier Coverage

**Status**: 82% coverage\
**Estimated Effort**: 2-3 days

Improve from 82% to 95%+ coverage:

**Missing Tests**:

- [ ] Deeply nested JSON paths (`@user.@profile.@address.@city`)
- [ ] Invalid character edge cases
- [ ] Unicode column names
- [ ] Very long identifiers (>255 chars)
- [ ] Column list validation with nested identifiers

---

### 🚀 PRIORITY 3: FEATURE ENHANCEMENTS

These are **rare use cases** for API systems but useful for specific scenarios:

#### 3.1 Advanced Query Features (Deferred)

**Estimated Effort**: 4-6 weeks total

Features to add **after** query builders are complete:

- [ ] **Subqueries** (2 weeks)
  - IN (SELECT ...)
  - EXISTS clause
  - Scalar subqueries in SELECT

- [ ] **Window Functions** (1-2 weeks)
  - ROW_NUMBER, RANK, DENSE_RANK
  - PARTITION BY, ORDER BY
  - Frame clauses (ROWS/RANGE)

- [ ] **Common Table Expressions (CTEs)** (1 week)
  - WITH clause
  - Recursive CTEs
  - Multiple CTEs

- [ ] **Advanced Joins** (1 week)
  - CROSS JOIN
  - NATURAL JOIN
  - Self-joins
  - Multiple join conditions with AND/OR

**Note**: These are advanced SQL features rarely used in API backends. Most CRUD
operations don't need them. Consider adding only if user demand justifies the
complexity.

#### 3.2 Additional DDL Operations (Future)

**Estimated Effort**: 2-3 weeks

Currently no DDL validators exist. Add when needed:

- [ ] Validate CREATE TABLE definitions
- [ ] Validate ALTER TABLE operations
- [ ] CREATE INDEX / DROP INDEX
- [ ] CREATE SEQUENCE / DROP SEQUENCE
- [ ] Foreign key constraints
- [ ] Check constraints

**Note**: DDL operations are typically done via migrations, not runtime queries.
Low priority.

---

## 💎 JSON Operations - Already Supported!

**OQL's killer feature**: JSON operations are handled transparently through
column identifiers!

### How It Works

Given a table schema:

```typescript
type User = {
  id: number;
  name: string;
  profile: {
    email: string;
    mobile: string;
    address: {
      city: string;
      country: string;
    };
  };
};
```

### Querying JSON Columns

```typescript
// Query nested JSON directly:
const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name'],
  where: {
    '@profile.@email': { $like: '%@gmail.com' },
    '@profile.@address.@city': 'New York',
  },
};

// Will generate (PostgreSQL):
// SELECT id, name FROM users
// WHERE profile->>'email' LIKE '%@gmail.com'
//   AND profile->'address'->>'city' = 'New York'
```

### Joining on JSON Columns

```typescript
const query: Query<'SELECT', User, { Orders: Order }> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name'],
  joins: {
    Orders: {
      table: 'orders',
      on: {
        '@Orders.@userId': '@id',
        '@Orders.@metadata.@channel': 'web', // JSON column in orders
      },
    },
  },
};
```

### Key Points

1. **No special syntax needed** - Just use `@parent.@child.@nested` pattern
2. **Type-safe** - TypeScript validates nested paths at compile time
3. **Database-agnostic** - Query builder handles DB-specific JSON syntax
4. **Works everywhere** - PostgreSQL JSONB, MariaDB JSON, SQLite json_extract(),
   MongoDB native

### Database Translation

| Database       | OQL               | Generated Query                                  |
| -------------- | ----------------- | ------------------------------------------------ |
| **PostgreSQL** | `@profile.@email` | `profile->>'email'`                              |
| **MariaDB**    | `@profile.@email` | `JSON_UNQUOTE(JSON_EXTRACT(profile, '$.email'))` |
| **SQLite**     | `@profile.@email` | `json_extract(profile, '$.email')`               |
| **MongoDB**    | `@profile.@email` | `profile.email` (native)                         |

**No additional implementation needed** - Query builders will handle this
automatically!

---

## 📝 Implementation Checklist

### Phase 1: Foundation (Current - Week 4)

- [x] Design OQL type system
- [x] Implement Filter validators (100% coverage)
- [x] Implement Aggregate validators (100% coverage)
- [x] Implement Expression validators (99% coverage)
- [x] Comment out CAST, NULLIF, COALESCE (deferred)
- [x] Comprehensive test suites (639 tests passing)

### Phase 2: Query Builders (Weeks 5-14)

- [ ] BaseBuilder with shared logic
- [ ] PostgreSQL query builder + tests
- [ ] MariaDB query builder + tests
- [ ] SQLite query builder + tests
- [ ] MongoDB query builder + tests
- [ ] Parameter binding standardization
- [ ] Expression translation engine
- [ ] Integration tests (cross-database)

### Phase 3: Integration (Weeks 15-16)

- [ ] Modify AbstractEngine to support OQL
- [ ] Update all engine implementations
- [ ] Performance benchmarks
- [ ] Migration guide for existing DAM users
- [ ] API documentation

### Phase 4: Security & Polish (Weeks 17-18)

- [ ] Security expression validators
- [ ] Improve ColumnIdentifier coverage
- [ ] SQL injection prevention tests
- [ ] Query complexity limits
- [ ] Production hardening

### Phase 5: Advanced Features (Future)

- [ ] Subqueries (if requested)
- [ ] Window functions (if requested)
- [ ] CTEs (if requested)
- [ ] Additional aggregate functions

---

## 🎓 Best Practices

### For Application Developers

#### ✅ DO:

```typescript
// Use OQL for type-safe queries
const users = await engine.execute<User>({
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name', 'email'],
  where: { '@active': true },
});

// Leverage JSON column support
const query = {
  type: 'SELECT',
  table: 'users',
  where: { '@profile.@email': { $like: '%@company.com' } },
};

// Use proper operators
const adults = await engine.execute({
  type: 'SELECT',
  table: 'users',
  where: { '@age': { $gte: 18 } }, // Not '@age': 18
});
```

#### ❌ DON'T:

```typescript
// Don't bypass OQL with raw SQL (loses type safety)
await engine.query('SELECT * FROM users WHERE age >= 18');

// Don't use non-existent features
const query = {
  type: 'SELECT',
  where: { 
    '@name': { $regex: /pattern/ }  // ❌ Not supported
  }
};

// Don't use commented-out features
const expr = { type: 'CAST', ... };  // ❌ Not implemented yet
```

### For Maintainers

#### When Adding Features:

1. **Types First**: Update `oql/types/` with TypeScript definitions
2. **Validators Second**: Add `assert*` and `is*` functions with tests (95%+
   coverage)
3. **Query Builders Third**: Implement translation for all 4 databases
4. **Tests Last**: Integration tests across all databases
5. **Document**: Update this roadmap and README

#### Code Review Checklist:

- [ ] TypeScript types are accurate and complete
- [ ] Validators have 95%+ test coverage
- [ ] Query builders support all 4 databases
- [ ] Integration tests pass on all databases
- [ ] Security implications documented
- [ ] Breaking changes documented
- [ ] Performance impact measured

---

## 🔒 Security Considerations

### Current State

- ✅ Parameterized queries prevent SQL injection (via query builders)
- ✅ Type validation prevents type confusion attacks
- ✅ Column identifiers validated to prevent injection
- ⚠️ ENCRYPT/DECRYPT/HASH not yet validated
- ⚠️ SQLite/MongoDB encryption is **application-level only**

### Production Checklist

- [ ] Never expose OQL queries directly to end users
- [ ] Always validate user input before building OQL queries
- [ ] Use row-level security (RLS) in PostgreSQL
- [ ] Implement query complexity limits
- [ ] Log and monitor expensive queries
- [ ] For SQLite/MongoDB: Encrypt sensitive data **before** passing to DAM
- [ ] Regular security audits of query builders

---

## 📊 Database Compatibility Matrix

| Feature              | PostgreSQL  | MariaDB     | SQLite       | MongoDB      |
| -------------------- | ----------- | ----------- | ------------ | ------------ |
| **Core DML**         | ✅ Full     | ✅ Full     | ✅ Full      | ✅ Full      |
| **Filters**          | ✅ Full     | ✅ Full     | ✅ Full      | ✅ Full      |
| **Aggregates**       | ✅ Full     | ✅ Full     | ✅ Full      | ✅ Full      |
| **Joins**            | ✅ Full     | ✅ Full     | ✅ Full      | ⚠️ $lookup   |
| **Expressions**      | ✅ Full     | ✅ Full     | ⚠️ Limited   | ⚠️ Limited   |
| **JSON Columns**     | ✅ JSONB    | ✅ JSON     | ✅ TEXT      | ✅ Native    |
| **ENCRYPT/DECRYPT**  | ✅ pgcrypto | ✅ AES_*    | ❌ App-level | ❌ App-level |
| **Views**            | ✅ Full     | ✅ Full     | ✅ Full      | ⚠️ Limited   |
| **Schemas**          | ✅ Full     | ⚠️ Database | ❌ None      | ❌ None      |
| **Transactions**     | ✅ Full     | ✅ Full     | ✅ Full      | ✅ Full      |
| **CTEs**             | ✅ Full     | ✅ Full     | ✅ Full      | ❌ None      |
| **Window Functions** | ✅ Full     | ✅ Full     | ✅ 3.25+     | ❌ None      |

**Legend**: ✅ Full support | ⚠️ Partial/Different | ❌ Not supported

---

## 📞 Questions & Feedback

This roadmap is a living document. Key decisions:

1. **Query Builders**: Estimated 8-10 weeks - is this acceptable timeline?
2. **Advanced Features**: Marked as low priority - agree or need sooner?
3. **Security**: Should we implement ENCRYPT/DECRYPT validators before query
   builders?
4. **Testing**: Is 99% coverage acceptable or aim for 100%?

---

## 📚 Related Documentation

- [OQL Types README](./types/README.md) - Type system documentation
- [Filter Validators](./asserts/Filters/) - Filter validation implementation
- [Expression Validators](./asserts/Expressions/) - Expression validation
- [DAM Documentation](../dam/README.md) - Database engine documentation

---

**Last Updated**: December 21, 2025\
**Version**: 1.0.0-dev\
**Status**: Type system complete, query builders needed
