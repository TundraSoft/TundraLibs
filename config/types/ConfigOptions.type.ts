import { ConfigType } from './ConfigType.type.ts';

export type ConfigOptions = {
  basePath: string;
  fileName: string;
  // configMode: ConfigMode;
  type: ConfigType;
  extention: string;
};
