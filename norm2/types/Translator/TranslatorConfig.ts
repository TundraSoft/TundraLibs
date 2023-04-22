import { DataTypes } from '../DataTypes.ts';

import type {
  GeneratorFunction,
  GeneratorOutput,
  Generators,
} from './Generators.ts';
import { Generator } from './Generators.ts';

export type TranslatorConfig = {
  quote: {
    column: '"' | '\'' | '`';
    value: '"' | '\'' | '`';
  };
  dataTypes: {
    [Property in keyof typeof DataTypes]: string;
  };
  generators: {
    [Property in Generators]: GeneratorOutput | GeneratorFunction;
  };
  // & { [key: string]: GeneratorOutput | GeneratorFunction };
  //Condition Mapper
  
};
