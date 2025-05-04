import { DAMEngineError, type DAMEngineErrorMeta } from './Base.ts';
import type { Query } from '../../types/mod.ts';

export class DAMEngineQueryError<
  M extends DAMEngineErrorMeta & {
    query: Query;
  } = DAMEngineErrorMeta & {
    query: Query;
  },
> extends DAMEngineError<M> {
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
