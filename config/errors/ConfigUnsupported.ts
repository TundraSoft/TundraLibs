import { ConfigBaseError } from './BaseError.ts';
// import type { ErrorMetaTags } from '../../utils/mod.ts';

export class ConfigUnsupported extends ConfigBaseError {
  constructor(config: string, meta: Record<string, unknown>) {
    super(config, 'Only YAML/YML, TOML and JSON files are supported.', meta);
  }
}
