import { DAMEngineError, type DAMEngineErrorMeta } from './Base.ts';

export class DAMEngineConfigError<
  M extends DAMEngineErrorMeta & { configKey: string; configValue?: unknown },
> extends DAMEngineError<M> {
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
