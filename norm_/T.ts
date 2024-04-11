import { DataModel } from './tests/testdata/DataModel.ts';
import { buildModel } from './dm.ts';
import type { DeepWritable } from '../utils/mod.ts';

type ModelType = DeepWritable<typeof DataModel>;
const model = buildModel(DataModel as ModelType);
