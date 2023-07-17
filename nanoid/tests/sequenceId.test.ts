import { sequenceId } from '../mod.ts';
import {
  assertEquals,
  assertMatch,
  assertNotEquals,
} from '../../dev.dependencies.ts';

Deno.test({
  name:
    `[library='nanoid' mode='sequenceId'] Ensure the values are in sequence`,
  fn() {
    for (let i = 0; i < 100; i++) {
      const res1 = sequenceId(),
        res2 = sequenceId();
      assertEquals(res2 - res1, 1n);
    }
  },
});

Deno.test({
  name:
    `[library='nanoid' mode='sequenceId'] Ensure the sequence is getting overridden`,
  fn() {
    const res1 = sequenceId(),
      res2 = sequenceId(3251);
    assertNotEquals(res2, res1 + 1n);
  },
});

Deno.test({
  name:
    `[library='nanoid' mode='sequenceId'] Check for collission on sample set of 10000`,
  fn() {
    const res: bigint[] = [];
    for (let i = 0; i < 10000; i++) {
      res.push(sequenceId());
    }
    assertEquals(res.length, 10000);
  },
});
