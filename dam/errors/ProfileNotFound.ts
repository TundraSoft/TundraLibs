import { DAMError } from './Base.ts';

export class DAMProfileNotFoundError extends DAMError {
  constructor(
    meta: { profileName: string },
    cause?: Error,
  ) {
    super(
      'Could not find connection profile with the name ${profileName}',
      meta,
      cause,
    );
  }
}
