export type ColumnValidations = {
  required?: {
    message?: string;
  };
  regex?: {
    pattern: RegExp;
    message?: string;
  };
  minLength?: {
    length: number;
    message?: string;
  };
  maxLength?: {
    length: number;
    message?: string;
  };
  range?: {
    min: number;
    max: number;
    message?: string;
  };
};
