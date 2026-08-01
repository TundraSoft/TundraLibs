import { describe, it } from './test.ts';
import {
  getPermissions,
  getPermissionsSync,
  hasPermission,
  hasPermissionSync,
  type PermissionName,
} from './permissions.ts';
import { RUNTIME } from './runtime.ts';
import { CompatTypeError } from './Error.ts';
import * as asserts from '@std/asserts';

describe({
  name: 'compat.permissions',
  fn: () => {
    describe('getPermissions (async)', () => {
      it('should return permission status for env', async () => {
        const result = await getPermissions({ name: 'env' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for env with variable', async () => {
        const result = await getPermissions({ name: 'env', variable: 'HOME' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for read', async () => {
        const result = await getPermissions({ name: 'read' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for read with path', async () => {
        const result = await getPermissions({ name: 'read', path: './' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for write', async () => {
        const result = await getPermissions({ name: 'write' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for write with path', async () => {
        const result = await getPermissions({ name: 'write', path: './' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for net', async () => {
        const result = await getPermissions({ name: 'net' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for net with host', async () => {
        const result = await getPermissions({
          name: 'net',
          host: 'example.com',
        });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for run', async () => {
        const result = await getPermissions({ name: 'run' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for sys', async () => {
        const result = await getPermissions({ name: 'sys' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for ffi', async () => {
        const result = await getPermissions({ name: 'ffi' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return GRANTED in non-Deno runtimes', async () => {
        const result = await getPermissions({ name: 'read' });
        if (RUNTIME !== 'DENO') {
          asserts.assertEquals(
            result,
            'GRANTED',
            'Non-Deno runtimes should return GRANTED',
          );
        }
      });
    });

    describe('getPermissionsSync (sync)', () => {
      it('should return permission status for env sync', () => {
        const result = getPermissionsSync({ name: 'env' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for env with variable sync', () => {
        const result = getPermissionsSync({ name: 'env', variable: 'PATH' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for read sync', () => {
        const result = getPermissionsSync({ name: 'read' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for read with path sync', () => {
        const result = getPermissionsSync({ name: 'read', path: './' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for write sync', () => {
        const result = getPermissionsSync({ name: 'write' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for net sync', () => {
        const result = getPermissionsSync({ name: 'net' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for net with host sync', () => {
        const result = getPermissionsSync({ name: 'net', host: 'localhost' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for run sync', () => {
        const result = getPermissionsSync({ name: 'run' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for sys sync', () => {
        const result = getPermissionsSync({ name: 'sys' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return permission status for ffi sync', () => {
        const result = getPermissionsSync({ name: 'ffi' });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should return GRANTED in non-Deno runtimes sync', () => {
        const result = getPermissionsSync({ name: 'read' });
        if (RUNTIME !== 'DENO') {
          asserts.assertEquals(
            result,
            'GRANTED',
            'Non-Deno runtimes should return GRANTED',
          );
        }
      });
    });

    describe('hasPermission (async wrapper)', () => {
      it('should return boolean for env permission', async () => {
        const result = await hasPermission({ name: 'env' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return boolean for read permission', async () => {
        const result = await hasPermission({ name: 'read' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return boolean for write permission', async () => {
        const result = await hasPermission({ name: 'write' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return boolean for net permission', async () => {
        const result = await hasPermission({ name: 'net' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return boolean for run permission', async () => {
        const result = await hasPermission({ name: 'run' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return boolean for sys permission', async () => {
        const result = await hasPermission({ name: 'sys' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return boolean for ffi permission', async () => {
        const result = await hasPermission({ name: 'ffi' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermission should return boolean',
        );
      });

      it('should return true in non-Deno runtimes', async () => {
        const result = await hasPermission({ name: 'read' });
        if (RUNTIME !== 'DENO') {
          asserts.assertEquals(
            result,
            true,
            'Non-Deno runtimes should return true',
          );
        }
      });
    });

    describe('hasPermissionSync (sync wrapper)', () => {
      it('should return boolean for env permission sync', () => {
        const result = hasPermissionSync({ name: 'env' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return boolean for read permission sync', () => {
        const result = hasPermissionSync({ name: 'read' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return boolean for write permission sync', () => {
        const result = hasPermissionSync({ name: 'write' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return boolean for net permission sync', () => {
        const result = hasPermissionSync({ name: 'net' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return boolean for run permission sync', () => {
        const result = hasPermissionSync({ name: 'run' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return boolean for sys permission sync', () => {
        const result = hasPermissionSync({ name: 'sys' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return boolean for ffi permission sync', () => {
        const result = hasPermissionSync({ name: 'ffi' });
        asserts.assertEquals(
          typeof result,
          'boolean',
          'hasPermissionSync should return boolean',
        );
      });

      it('should return true in non-Deno runtimes sync', () => {
        const result = hasPermissionSync({ name: 'read' });
        if (RUNTIME !== 'DENO') {
          asserts.assertEquals(
            result,
            true,
            'Non-Deno runtimes should return true',
          );
        }
      });
    });

    describe('Permission types validation', () => {
      const allPermissions: PermissionName[] = [
        'env',
        'ffi',
        'net',
        'read',
        'run',
        'sys',
        'write',
        'import',
      ];

      it('should handle all permission types', async () => {
        for (const permName of allPermissions) {
          const result = await getPermissions({ name: permName });
          asserts.assert(
            result === 'GRANTED' || result === 'DENIED',
            `Invalid response for ${permName}: ${result}`,
          );
        }
      });

      it('should handle all permission types sync', () => {
        for (const permName of allPermissions) {
          const result = getPermissionsSync({ name: permName });
          asserts.assert(
            result === 'GRANTED' || result === 'DENIED',
            `Invalid response for ${permName}: ${result}`,
          );
        }
      });
    });

    describe('Edge cases', () => {
      it('should handle URL path for read permission', async () => {
        const result = await getPermissions({
          name: 'read',
          path: new URL('./', import.meta.url),
        });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should handle URL path for write permission', async () => {
        const result = await getPermissions({
          name: 'write',
          path: new URL('./', import.meta.url),
        });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });

      it('should handle URL path for ffi permission', async () => {
        const result = await getPermissions({
          name: 'ffi',
          path: new URL('./', import.meta.url),
        });
        asserts.assert(
          result === 'GRANTED' || result === 'DENIED',
          `Invalid permission response: ${result}`,
        );
      });
    });

    describe('Invalid permission names', () => {
      it('should throw CompatTypeError for invalid permission name (async)', () => {
        asserts.assertThrows(
          () =>
            getPermissions(
              { name: 'invalid' as unknown as 'read' },
            ),
          CompatTypeError,
          'Invalid permission name',
        );
      });

      it('should throw CompatTypeError for invalid permission name (sync)', () => {
        asserts.assertThrows(
          () =>
            getPermissionsSync(
              { name: 'invalid' as unknown as 'read' },
            ),
          CompatTypeError,
          'Invalid permission name',
        );
      });

      it('should throw CompatTypeError for empty string permission name (async)', () => {
        asserts.assertThrows(
          () =>
            getPermissions(
              { name: '' as unknown as 'read' },
            ),
          CompatTypeError,
          'Invalid permission name',
        );
      });

      it('should throw CompatTypeError for empty string permission name (sync)', () => {
        asserts.assertThrows(
          () =>
            getPermissionsSync(
              { name: '' as unknown as 'read' },
            ),
          CompatTypeError,
          'Invalid permission name',
        );
      });
    });
  },
});
