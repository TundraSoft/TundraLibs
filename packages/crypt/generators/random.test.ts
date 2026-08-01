import { assert, assertEquals, assertThrows } from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { randomFloat, randomInt, randomNumber } from './random.ts';

describe('crypt.random', () => {
  describe('randomInt', () => {
    it('basic functionality', () => {
      const min = 1;
      const max = 100;

      for (let i = 0; i < 100; i++) {
        const value = randomInt(min, max);
        assert(Number.isInteger(value), `Value ${value} is not an integer`);
        assert(value >= min, `Value ${value} is below minimum ${min}`);
        assert(value <= max, `Value ${value} is above maximum ${max}`);
      }
    });

    it('edge cases and validation', () => {
      // Test edge cases
      assertEquals(randomInt(0, 0), 0);
      assertEquals(randomInt(5, 5), 5);

      // Test negative ranges
      const negativeValue = randomInt(-10, -5);
      assert(negativeValue >= -10 && negativeValue <= -5);

      // Test error conditions
      assertThrows(
        () => randomInt(10, 5),
        Error,
        'Min cannot be greater than max',
      );
      assertThrows(
        () => randomInt(1.5, 5),
        Error,
        'Min and max must be safe integers',
      );
      assertThrows(
        () => randomInt(1, 5.5),
        Error,
        'Min and max must be safe integers',
      );
    });

    it('statistical properties', () => {
      const min = 1;
      const max = 20;
      const samples = Array.from({ length: 1000 }, () => randomInt(min, max));

      // Check all values are in range
      const inRange = samples.every((x) => x >= min && x <= max);
      assert(inRange, 'All values should be in range');

      // Check distribution is reasonable
      const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      const expectedMean = (min + max) / 2;
      const meanError = Math.abs(mean - expectedMean) / expectedMean;
      assert(
        meanError < 0.1,
        `Mean ${mean} deviates too much from expected ${expectedMean}`,
      );
    });

    it('large range handling', () => {
      // Test large ranges (> 256) to trigger different code path
      const largeRangeValue = randomInt(1000, 10000);
      assert(
        largeRangeValue >= 1000 && largeRangeValue <= 10000,
        'Large range value out of bounds',
      );

      // Test very large ranges
      const veryLargeValue = randomInt(0, 1000000);
      assert(
        veryLargeValue >= 0 && veryLargeValue <= 1000000,
        'Very large range value out of bounds',
      );

      // Test maximum safe integer range
      const maxSafeValue = randomInt(
        Number.MAX_SAFE_INTEGER - 100,
        Number.MAX_SAFE_INTEGER,
      );
      assert(
        maxSafeValue >= Number.MAX_SAFE_INTEGER - 100,
        'Max safe integer range failed',
      );
    });

    it('ranges needing 4+ bytes stay in [min, max]', () => {
      // Ranges above 2^24 require >= 4 bytes. The old `<<`-based accumulator
      // overflowed to 32-bit signed integers here, producing negative /
      // out-of-range values; BigInt accumulation must keep every sample inside
      // the requested bounds.
      const cases: Array<[number, number]> = [
        [0, 2 ** 24], // exactly the 4-byte boundary
        [0, 2 ** 32 - 1], // full 4-byte range
        [0, 2 ** 40], // 6-byte range
        [-(2 ** 33), 2 ** 33], // wide range straddling zero
      ];

      for (const [min, max] of cases) {
        for (let i = 0; i < 500; i++) {
          const value = randomInt(min, max);
          assert(
            Number.isInteger(value),
            `Value ${value} for range [${min}, ${max}] is not an integer`,
          );
          assert(
            value >= min,
            `Value ${value} is below minimum ${min}`,
          );
          assert(
            value <= max,
            `Value ${value} is above maximum ${max}`,
          );
        }
      }
    });

    it('4+ byte ranges remain roughly uniform (no sign bias)', () => {
      // A signed-shift overflow biases the distribution heavily toward the
      // low/negative end. Sampling the bottom-vs-top halves of a 4-byte range
      // should land near 50/50.
      const min = 0;
      const max = 2 ** 32 - 1;
      const mid = max / 2;
      const samples = 2000;
      let lower = 0;
      for (let i = 0; i < samples; i++) {
        if (randomInt(min, max) < mid) lower++;
      }
      const ratio = lower / samples;
      assert(
        ratio > 0.4 && ratio < 0.6,
        `Distribution skewed for 4-byte range: ${ratio} fell in lower half`,
      );
    });
  });

  describe('randomFloat', () => {
    it('basic functionality', () => {
      const min = 0;
      const max = 1;

      for (let i = 0; i < 100; i++) {
        const value = randomFloat(min, max);
        assert(typeof value === 'number', `Value ${value} is not a number`);
        assert(value >= min, `Value ${value} is below minimum ${min}`);
        assert(value < max, `Value ${value} is not less than maximum ${max}`);
      }
    });

    it('validation', () => {
      // Test error conditions
      assertThrows(() => randomFloat(1, 1), Error, 'Min must be less than max');
      assertThrows(
        () => randomFloat(10, 5),
        Error,
        'Min must be less than max',
      );
    });

    it('precision testing', () => {
      // Test with different precision values
      const value2dp = randomFloat(0, 1, 2);
      const valueStr = value2dp.toString();
      const decimalPlaces = valueStr.includes('.')
        ? (valueStr.split('.')[1]?.length || 0)
        : 0;
      assert(
        decimalPlaces <= 2,
        `Expected max 2 decimal places, got ${decimalPlaces}`,
      );

      // Test precision boundary
      const highPrecision = randomFloat(0, 1, 10);
      assert(
        typeof highPrecision === 'number',
        'High precision should return number',
      );
      assert(
        highPrecision >= 0 && highPrecision < 1,
        'High precision value out of range',
      );
    });
  });

  it('randomNumber - with options', () => {
    // Test integer mode
    const intValue = randomNumber({ min: 1, max: 10, float: false });
    assert(Number.isInteger(intValue), 'Integer mode should return integer');
    assert(intValue >= 1 && intValue <= 10, 'Integer value out of range');

    // Test float mode
    const floatValue = randomNumber({ min: 0, max: 1, float: true });
    assert(typeof floatValue === 'number', 'Float mode should return number');
    assert(floatValue >= 0 && floatValue < 1, 'Float value out of range');

    // Test defaults
    const defaultValue = randomNumber();
    assert(Number.isInteger(defaultValue), 'Default should be integer');
    assert(defaultValue >= 0, 'Default minimum should be 0');

    // Test precision option
    const preciseValue = randomNumber({
      min: 0,
      max: 1,
      float: true,
      precision: 3,
    });
    assert(typeof preciseValue === 'number', 'Precise value should be number');

    // Test custom range
    const customRange = randomNumber({ min: 50, max: 100 });
    assert(
      customRange >= 50 && customRange <= 100,
      'Custom range out of bounds',
    );
  });

  it('performance - generation speed', () => {
    const start = performance.now();

    // Generate many random numbers
    for (let i = 0; i < 10000; i++) {
      randomInt(1, 100);
    }

    const duration = performance.now() - start;
    console.log(`Generated 10,000 random integers in ${duration.toFixed(2)}ms`);

    // Should complete in reasonable time (less than 1 second)
    assert(duration < 1000, `Performance too slow: ${duration}ms`);
  });

  it('security - no predictable patterns', () => {
    // Generate sequence and check for obvious patterns
    const sequence = Array.from({ length: 1000 }, () => randomInt(0, 255));

    // Check for run-length patterns (no more than 5 consecutive identical values)
    let maxRun = 1;
    let currentRun = 1;

    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] === sequence[i - 1]) {
        currentRun++;
        maxRun = Math.max(maxRun, currentRun);
      } else {
        currentRun = 1;
      }
    }

    assert(maxRun <= 5, `Suspicious run length detected: ${maxRun}`);
  });
});
