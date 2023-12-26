import { describe } from '../../dev.dependencies.ts';
import { SQLiteClient } from '../dialects/mod.ts';
import type { SQLiteConnectionOptions } from '../types/mod.ts';
import {
  makeSQLiteFileOptions,
  makeSQLiteMemoryOptions,
  runStandardFlatFileConnectionTests,
  runStandardQueryTests,
} from './testdata/utils/ClientTestHelper.ts';
import { runQueryTranslationTests } from './testdata/utils/TranslatorTestHelper.ts';

describe(`[library='norm' dialect='SQLite'  type='unit']`, () => {
  const clientOptMemory: SQLiteConnectionOptions = makeSQLiteMemoryOptions();
  const clientOptFile: SQLiteConnectionOptions = makeSQLiteFileOptions();
  runStandardFlatFileConnectionTests(
    SQLiteClient,
    clientOptMemory,
  );
  runStandardFlatFileConnectionTests(
    SQLiteClient,
    clientOptFile,
  );
  runStandardQueryTests(
    SQLiteClient,
    clientOptMemory,
    false,
    true,
  );
  runStandardQueryTests(
    SQLiteClient,
    clientOptFile,
    false,
    false,
  );
  runQueryTranslationTests(
    SQLiteClient,
    clientOptMemory,
    true,
  );
  runQueryTranslationTests(
    SQLiteClient,
    clientOptFile,
    false,
  );
});
