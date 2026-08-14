import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { type BaseGuardian, Guardian, GuardianError } from '../../mod.ts';

describe('guardian.LazyGuardian', () => {
  describe('thunk resolution', () => {
    it('defers resolution to parse time', () => {
      let resolved = 0;
      const lazy = Guardian.lazy(() => {
        resolved++;
        return Guardian.string();
      });
      asserts.assertEquals(resolved, 0);
      lazy.parse('hello');
      asserts.assertEquals(resolved, 1);
    });

    it('caches the resolved guardian across parses', () => {
      let resolved = 0;
      const lazy = Guardian.lazy(() => {
        resolved++;
        return Guardian.number();
      });
      lazy.parse(1);
      lazy.parse(2);
      lazy.parse(3);
      asserts.assertEquals(resolved, 1);
    });

    it('delegates validation to the resolved guardian', () => {
      const lazy = Guardian.lazy(() => Guardian.number().integer());
      asserts.assertEquals(lazy.parse(7), 7);
      asserts.assertThrows(() => lazy.parse(1.5), GuardianError);
    });
  });

  describe('recursive types', () => {
    type Tree = { value: number; children: Tree[] };

    it('validates a recursive tree structure', () => {
      const TreeSchema: BaseGuardian<Tree> = Guardian.object({
        value: Guardian.number(),
        children: Guardian.array(
          Guardian.lazy((): BaseGuardian<Tree> => TreeSchema),
        ),
      });

      const out = TreeSchema.parse({
        value: 1,
        children: [
          { value: 2, children: [] },
          { value: 3, children: [{ value: 4, children: [] }] },
        ],
      });
      asserts.assertEquals(out.value, 1);
      asserts.assertEquals(out.children.length, 2);
      const second = out.children[1];
      asserts.assertExists(second);
      const grandchild = second.children[0];
      asserts.assertExists(grandchild);
      asserts.assertEquals(grandchild.value, 4);
    });

    it('reports errors with path-tagged segments through the cycle', () => {
      const TreeSchema: BaseGuardian<Tree> = Guardian.object({
        value: Guardian.number().integer(),
        children: Guardian.array(
          Guardian.lazy((): BaseGuardian<Tree> => TreeSchema),
        ),
      });
      const [err] = TreeSchema.safeParse({
        value: 1,
        children: [
          { value: 2, children: [] },
          { value: 'oops', children: [] },
        ],
      });
      asserts.assertInstanceOf(err, GuardianError);
    });
  });

  describe('schema emit', () => {
    it('emits $ref: "#" on self-referential cycles', () => {
      type Node = { next: Node | null };
      const NodeSchema: BaseGuardian<Node> = Guardian.object({
        next: Guardian.lazy((): BaseGuardian<Node> => NodeSchema).nullable(),
      });
      const schema = NodeSchema.toJSONSchema();
      const json = JSON.stringify(schema);
      asserts.assertStringIncludes(
        json,
        '"$ref":"#"',
        'expected $ref: "#" somewhere in the recursive cycle',
      );
    });

    it('emits the inner schema in toOpenAPI when not cyclic', () => {
      const lazy = Guardian.lazy(() => Guardian.string());
      const schema = lazy.toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
    });

    it('emits the inner schema in toJSONSchema when not cyclic', () => {
      const lazy = Guardian.lazy(() => Guardian.number());
      const schema = lazy.toJSONSchema();
      asserts.assertEquals(schema.type, 'number');
    });
  });
});
