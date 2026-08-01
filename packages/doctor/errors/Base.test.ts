/**
 * @fileoverview Tests for the package base error and derived errors.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { BaseError } from '@tundralibs/utils';
import {
  DoctorError,
  DuplicateVialError,
  MissingDesignTypeError,
  MissingMetadataError,
  ScopeRequiredError,
  UnregisteredVialError,
} from './mod.ts';

describe('errors', () => {
  describe('DoctorError', () => {
    it('should be a subclass of BaseError and Error', () => {
      const err = new DoctorError('boom', { foo: 'bar' });
      asserts.assert(err instanceof DoctorError);
      asserts.assert(err instanceof BaseError);
      asserts.assert(err instanceof Error);
      asserts.assertEquals(err.name, 'DoctorError');
      asserts.assertEquals(err.message, 'boom');
      asserts.assertEquals(err.context.foo, 'bar');
    });
  });

  describe('UnregisteredVialError', () => {
    it('should derive from DoctorError and carry vialName context', () => {
      const err = new UnregisteredVialError(
        "No service registered for 'Foo'",
        { vialName: 'Foo' },
      );
      asserts.assert(err instanceof UnregisteredVialError);
      asserts.assert(err instanceof DoctorError);
      asserts.assertEquals(err.context.vialName, 'Foo');
    });
  });

  describe('MissingMetadataError', () => {
    it('should derive from DoctorError', () => {
      const err = new MissingMetadataError('reflect-metadata missing');
      asserts.assert(err instanceof MissingMetadataError);
      asserts.assert(err instanceof DoctorError);
    });
  });

  describe('MissingDesignTypeError', () => {
    it('should derive from DoctorError and carry property context', () => {
      const err = new MissingDesignTypeError('no type for foo', {
        property: 'foo',
      });
      asserts.assert(err instanceof MissingDesignTypeError);
      asserts.assert(err instanceof DoctorError);
      asserts.assertEquals(err.context.property, 'foo');
    });
  });

  describe('ScopeRequiredError', () => {
    it('should derive from DoctorError and carry vialName context', () => {
      const err = new ScopeRequiredError("'Db' is SCOPED", {
        vialName: 'Db',
      });
      asserts.assert(err instanceof ScopeRequiredError);
      asserts.assert(err instanceof DoctorError);
      asserts.assertEquals(err.context.vialName, 'Db');
    });
  });

  describe('DuplicateVialError', () => {
    it('should derive from DoctorError and carry vialName context', () => {
      const err = new DuplicateVialError("'Logger' already registered", {
        vialName: 'Logger',
      });
      asserts.assert(err instanceof DuplicateVialError);
      asserts.assert(err instanceof DoctorError);
      asserts.assertEquals(err.context.vialName, 'Logger');
    });
  });
});
