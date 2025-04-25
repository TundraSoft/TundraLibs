import { DAMError } from './Base.ts';

export class DAMDuplicateProfileError extends DAMError {
  constructor(
    meta: { profileName: string },
    cause?: Error,
  ) {
    super(
      'There is already a connection profile with the name ${profileName}',
      meta,
      cause,
    );
  }
}
