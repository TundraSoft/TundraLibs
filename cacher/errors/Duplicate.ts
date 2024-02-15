import { CacherBaseError } from './Base.ts';

export class DuplicateCacher extends CacherBaseError {
  constructor(key: string) {
    super(`There already exists an instance of Cacher with the name ${key}.`, {
      key,
    });
  }
}
