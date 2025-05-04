import type { ColumnDefinition, ColumnIdentifier } from '../types/mod.ts';
import {
  type DataType,
  DataTypes,
  DecimalDataTypes,
  StringDataTypes,
} from '../const/DataTypes.ts';
import { assertEntityName } from './EntityName.ts';

export const assertColumnIdentifier: (
  value: unknown,
) => asserts value is ColumnIdentifier = (
  value: unknown,
) => {
  if (typeof value !== 'string') {
    throw new TypeError(`ColumnIdentifier must start with $`);
  }

  const parts = value.split('.');
  if (parts.length > 2) {
    throw new TypeError(
      `Invalid ColumnIdentifier syntax. Expects value to be of pattern $entity.$column`,
    );
  }

  for (const part of parts) {
    if (!part.startsWith('$')) {
      throw new TypeError(
        `Each part of ColumnIdentifier ${value}, must start with $.`,
      );
    }
    try {
      assertEntityName(part.replace(/^\$/, ''));
    } catch {
      throw new TypeError(
        `Invalid ColumnIdentifier ${value}, each part must be a valid entity name.`,
      );
    }
  }
};

export const assertDataType: (x: unknown) => asserts x is DataType = (
  x: unknown,
) => {
  if (typeof x !== 'string') {
    throw new TypeError(`Expected a string, but received: ${typeof x}`);
  }

  if (!Object.keys(DataTypes).includes(x)) {
    throw new TypeError(`Invalid data type: ${x}`);
  }
};

export const assertColumnDefinition: (
  x: unknown,
) => asserts x is ColumnDefinition = (
  x: unknown,
) => {
  if (x === null || typeof x !== 'object') {
    throw new TypeError(`Expected an object, but received: ${typeof x}`);
  }

  // Ok check the mandatory properties
  if (!('type' in x) || typeof x.type !== 'string') {
    throw new TypeError(`Missing required property 'type'`);
  }
  assertDataType(x.type);

  if ('name' in x) {
    if (typeof x.name !== 'string') {
      throw new TypeError(
        `Expected 'name' to be a string, but received: ${typeof x.name}`,
      );
    }
    assertEntityName(x.name);
  }

  if ('nullable' in x) {
    if (typeof x.nullable !== 'boolean') {
      throw new TypeError(
        `Expected 'nullable' to be a boolean, but received: ${typeof x
          .nullable}`,
      );
    }
  }

  if ('comment' in x) {
    if (typeof x.comment !== 'string' || x.comment.trim().length > 255) {
      throw new TypeError(
        `Expected 'comment' to be a string, but received: ${typeof x.comment}`,
      );
    }
  }

  if (Object.keys(StringDataTypes).includes(x.type)) {
    if ('length' in x) {
      if (typeof x.length !== 'number' || x.length <= 0) {
        throw new TypeError(
          `Expected 'length' to be a positive number, but received: ${x.length}`,
        );
      }
    }
  }

  if (Object.keys(DecimalDataTypes).includes(x.type)) {
    if ('precision' in x) {
      if (typeof x.precision !== 'number' || x.precision <= 0) {
        throw new TypeError(
          `Expected 'precision' to be a positive number, but received: ${x.precision}`,
        );
      }
    }

    if ('scale' in x) {
      if (typeof x.scale !== 'number' || x.scale < 0) {
        throw new TypeError(
          `Expected 'scale' to be a non-negative number, but received: ${x.scale}`,
        );
      }
    }
  }
};
