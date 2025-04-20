import { DAMEngineError, type DAMEngineErrorMeta } from './Base.ts';

export class DAMEngineConnectError<
  M extends DAMEngineErrorMeta = DAMEngineErrorMeta,
> extends DAMEngineError<M> {
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
