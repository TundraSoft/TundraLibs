# ID

Collection of ID and Key generators.

## Table of Contents

- [nanoID](#nanoid)
- [ObjectID](#objectid)
- [Sequence ID](#sequence-id)
- [Simple ID](#simple-id)

## nanoID

A secure, URL-friendly unique ID generator based on the Node.js [nanoid](https://github.com/ai/nanoid) project.

### Features

- Generates unique IDs with customizable length
- Uses cryptographically strong random values
- Provides various character sets (NUMBERS, ALPHABETS, WEB_SAFE, etc.)
- Low collision probability (<1% when generating 10,000,000 IDs)

### Usage

```typescript
import { ALPHA_NUMERIC, nanoID, NUMBERS, PASSWORD } from './nanoID.ts';

// Default usage (21 characters with web-safe characters)
const id = nanoID();
console.log(id); // e.g., "e8cfr9t_jw-4kd93mc0fg"

// Custom length (10 characters)
const shortId = nanoID(10);
console.log(shortId); // e.g., "f7d9m3_8tz"

// Custom character set (numbers only)
const numericId = nanoID(8, NUMBERS);
console.log(numericId); // e.g., "73948215"

// Password-friendly characters
const strongId = nanoID(15, PASSWORD);
console.log(strongId); // e.g., "f$8%j^m&w!3ze@9"
```

## ObjectID

Generates unique IDs similar to MongoDB's ObjectId format.

### Features

- Timestamp-based for chronological sorting
- Includes machine identifier and process ID components
- Includes an incrementing counter for uniqueness
- Hexadecimal string format

### Usage

```typescript
import { ObjectID } from './ObjectID.ts';

// Basic usage
const generateID = ObjectID();
const id1 = generateID();
const id2 = generateID();
console.log(id1); // e.g., "64a1b3c7abc4f2123"
console.log(id2); // e.g., "64a1b3c7abc4f2124"

// With custom machine ID
const generateCustomID = ObjectID(0, 'srv');
const customId = generateCustomID();
console.log(customId); // e.g., "64a1b3c7srv4f2123"
```

## Sequence ID

Generates unique sequential IDs based on server information and a counter.

### Features

- Based on server ID (process ID)
- Includes server startup time
- Uses an incrementing counter for uniqueness
- Returns a BigInt for precision and range

### Usage

```typescript
import { sequenceID } from './sequenceID.ts';

// Basic usage
const id1 = sequenceID();
const id2 = sequenceID();
console.log(id1); // e.g., 132774828013396993n
console.log(id2); // e.g., 132774828013396994n

// With custom counter value
const id3 = sequenceID(100);
const id4 = sequenceID();
console.log(id3); // e.g., 132774828013397093n
console.log(id4); // e.g., 132774828013397094n
```

## Simple ID

Generates sequential IDs based on the current date and a seed value.

### Features

- Date-based prefix for chronological sorting
- Auto-resetting counter when date changes
- Configurable seed and padding
- Returns a BigInt to handle large values

### Usage

```typescript
import { simpleID } from './simpleID.ts';

// Basic usage
const generateID = simpleID();
const id1 = generateID();
const id2 = generateID();
console.log(id1); // e.g., 202307200001n
console.log(id2); // e.g., 202307200002n

// Custom seed and padding
const generateCustomID = simpleID(100, 6);
const customId1 = generateCustomID();
const customId2 = generateCustomID();
console.log(customId1); // e.g., 20230720000101n
console.log(customId2); // e.g., 20230720000102n
```
