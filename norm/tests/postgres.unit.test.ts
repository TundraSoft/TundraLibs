import { describe } from '../../dev.dependencies.ts';
import { PostgresClient } from '../dialects/mod.ts';
import type { PostgresConnectionOptions } from '../types/mod.ts';
import {
  makePostgresOptions,
  runStandardQueryTests,
  runStandardRemoteConnectionTests,
} from './testdata/utils/ClientTestHelper.ts';

describe(`[library='norm' dialect='POSTGRES' type='unit']`, () => {
  const clientOpt: PostgresConnectionOptions = makePostgresOptions();
  runStandardRemoteConnectionTests(
    PostgresClient,
    clientOpt,
  );
  runStandardQueryTests(
    PostgresClient,
    clientOpt,
  );
});
