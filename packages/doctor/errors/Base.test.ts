/**
 * @fileoverview Tests for the package base error and derived errors.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { BaseError } from '@tundralibs/utils';
import {
  CircularDependencyError,
  DoctorError,
  DuplicateVialError,
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

  describe('CircularDependencyError', () => {
    it('should derive from DoctorError and carry vialName context', () => {
      const err = new CircularDependencyError(
        "Circular dependency detected while resolving 'A'",
        { vialName: 'A' },
      );
      asserts.assert(err instanceof CircularDependencyError);
      asserts.assert(err instanceof DoctorError);
      asserts.assertEquals(err.context.vialName, 'A');
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
