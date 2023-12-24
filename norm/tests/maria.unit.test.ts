import { describe } from '../../dev.dependencies.ts';
import { MariaClient } from '../dialects/mod.ts';
import type { MariaConnectionOptions } from '../types/mod.ts';
import {
  makeMariaOptions,
  runStandardConnectionTests,
  runStandardQueryTests,
} from './testdata/utils/ClientTestHelper.ts';

describe(`[library='norm' dialect='MARIADB' type='unit']`, () => {
  const clientOpt: MariaConnectionOptions = makeMariaOptions();
  runStandardConnectionTests(
    MariaClient,
    clientOpt,
  );
  runStandardQueryTests(
    MariaClient,
    clientOpt,
  );
});
