import { CacherError, type CacherErrorMeta } from './Base.ts';

export class CacherOperationError<
  M extends CacherErrorMeta & {
    operation: 'GET' | 'SET' | 'HAS' | 'DELETE' | 'CLEAR' | 'OTHER';
    key?: string;
  } = CacherErrorMeta & {
    operation: 'GET' | 'SET' | 'HAS' | 'DELETE' | 'CLEAR' | 'OTHER';
    key?: string;
  },
> extends CacherError<M> {
  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
