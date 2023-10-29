import { Dialects } from '../Dialects.ts';
import { ErrorMetaTags } from '../../../utils/BaseError.ts';

export type NormMetaTags = {
  dialect: Dialects;
  config: string;
} & ErrorMetaTags;
