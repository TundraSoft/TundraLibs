import { assertEquals, describe, it } from '../../dev.dependencies.ts';
import { passwordGenerator } from '../mod.ts';

describe('id', () => {
  describe('passwordGenerator', () => {
    it('Check for length consistency on sample set of 10000', () => {
      for (let i = 6; i <= 40; i++) {
        for (let j = 0; j < 10000; j++) {
          assertEquals(i, passwordGenerator(i).length);
        }
      }
    });
  });
});
