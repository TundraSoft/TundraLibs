import { DAMEngineError, type DAMEngineErrorMeta } from './Base.ts';

export class DAMEngineConnectError<
  M extends DAMEngineErrorMeta,
> extends DAMEngineError<M> {
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
