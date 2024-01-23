import {
  afterEach,
  assertThrows,
  beforeEach,
  describe,
  it,
} from '../../../dev.dependencies.ts';
import { assertEquals } from '../../../dev.dependencies.ts';

import { SQLiteClient } from '../../dialects/mod.ts';
import { NormConfigError } from '../../errors/mod.ts';
import { SQLiteOptions } from '../../types/mod.ts';

describe(`[library='Norm' dialect='SQLite' mode='memory' group='client']`, () => {
  const configs: Record<string, Record<string, unknown>> = {
    'invalid_mode': {
      mode: 'mEmOrY',
    },
    'invalid_mode2': {
      mode: 'DISK',
    },
    'memory': {
      mode: 'MEMORY',
      dialect: 'SQLITE',
    },
  };
  let client: SQLiteClient | undefined = undefined;
  beforeEach(() => {
    // Create the
    client = new SQLiteClient('sqlite', configs['memory'] as SQLiteOptions);
  });

  afterEach(() => {
    client?.close();
    client = undefined;
  });

  it('Test invalid configurations', () => {
    assertThrows(
      () =>
        new SQLiteClient('sqlite', configs['invalid_mode'] as SQLiteOptions),
      NormConfigError,
    );
    assertThrows(
      () =>
        new SQLiteClient('sqlite', configs['invalid_mode2'] as SQLiteOptions),
      NormConfigError,
    );
  });

  it('Create tables', async () => {
    await client?.execute(`CREATE TABLE Users (
      UserID INT PRIMARY KEY,
      UserName VARCHAR(100),
      UserEmail VARCHAR(100)
    );`);
    await client?.execute(`CREATE TABLE Posts (
      PostID INT PRIMARY KEY,
      PostTitle VARCHAR(100),
      PostContent TEXT,
      PostAuthor INT,
      FOREIGN KEY(PostAuthor) REFERENCES Users(UserID)
    );`);
    await client?.execute(`CREATE TABLE Comments (
      CommentID INT PRIMARY KEY,
      CommentContent TEXT,
      CommentAuthor INT,
      CommentPost INT,
      FOREIGN KEY(CommentAuthor) REFERENCES Users(UserID),
      FOREIGN KEY(CommentPost) REFERENCES Posts(PostID)
    );`);
    console.log(await client?.query(`SELECT *, :t: FROM Users;`, { a: 'df' }));
  });
});
