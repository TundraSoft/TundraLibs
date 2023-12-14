import {
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';
import { PostgresClient } from '../Dialects/mod.ts';
import type { PostgresConnectionOptions } from '../types/mod.ts';
import { NormConfigError } from '../errors/mod.ts';
import { 
  makePostgresOptions,
  runStandardConnectionTests,
  runStandardQueryTests
} from './testdata/utils/ClientTestHelper.ts';

describe(`[library='norm' dialect='POSTGRES' type='unit']`, () => {
  const clientOpt: PostgresConnectionOptions = makePostgresOptions();
  runStandardConnectionTests(
    PostgresClient,
    clientOpt
  );
  runStandardQueryTests(    
    PostgresClient,
    clientOpt
  );

  it('should throw error if poolSize < 0 or greater than 100', () => {
    const opt = JSON.parse(
      JSON.stringify({
        dialect: clientOpt.dialect,
        host: clientOpt.host,
        username: clientOpt.username,
        password: clientOpt.password,
        database: clientOpt.database,
        port: clientOpt.port,
        poolSize: -1,
      }),
    );
    assertThrows(() => {
      new PostgresClient('FailTest', opt);
    }, NormConfigError);
    const opt2 = JSON.parse(
      JSON.stringify({
        dialect: clientOpt.dialect,
        host: clientOpt.host,
        username: clientOpt.username,
        password: clientOpt.password,
        database: clientOpt.database,
        port: clientOpt.port,
        poolSize: 88888888,
      }),
    );
    assertThrows(() => {
      new PostgresClient('FailTest', opt2);
    }, NormConfigError);
  });
  
});
