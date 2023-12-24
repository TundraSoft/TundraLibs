import { describe } from '../../dev.dependencies.ts';
import { PostgresClient } from '../dialects/mod.ts';
import type { PostgresConnectionOptions } from '../types/mod.ts';
import {
  makePostgresOptions,
  runStandardConnectionTests,
  runStandardQueryTests,
} from './testdata/utils/ClientTestHelper.ts';

describe(`[library='norm' dialect='POSTGRES' type='unit']`, () => {
  const clientOpt: PostgresConnectionOptions = makePostgresOptions();
  runStandardConnectionTests(
    PostgresClient,
    clientOpt,
  );
  runStandardQueryTests(
    PostgresClient,
    clientOpt,
  );
});
