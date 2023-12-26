import { describe } from '../../dev.dependencies.ts';
import { MariaClient } from '../dialects/mod.ts';
import type { MariaConnectionOptions } from '../types/mod.ts';
import {
  makeMariaOptions,
  runStandardQueryTests,
  runStandardRemoteConnectionTests,
} from './testdata/utils/ClientTestHelper.ts';
import { runQueryTranslationTests } from './testdata/utils/TranslatorTestHelper.ts';

describe(`[library='norm' dialect='MARIA' type='unit']`, () => {
  const clientOpt: MariaConnectionOptions = makeMariaOptions();
  runStandardRemoteConnectionTests(
    MariaClient,
    clientOpt,
  );
  runStandardQueryTests(
    MariaClient,
    clientOpt,
  );
  runQueryTranslationTests(
    MariaClient,
    clientOpt,
  );
});
