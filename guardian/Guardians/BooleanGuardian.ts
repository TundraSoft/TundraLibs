import { BaseGuardian } from '../BaseGuardian.ts';
import { type } from '../utils/mod.ts';
import type { FunctionParameters, FunctionType } from '../types/mod.ts';

/**
 * BooleanGuardian
 *
 * Guardian class for Boolean data type
 *
 * @class BooleanGuardian
 */
export class BooleanGuardian<
  P extends FunctionParameters = [boolean],
> extends BaseGuardian<FunctionType<boolean, P>> {
}

export const booleanGuard = new BooleanGuardian(type('boolean')).proxy();
