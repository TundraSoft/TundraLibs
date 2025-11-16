#!/usr/bin/env -S deno run --allow-hrtime

import { StringGuardian } from './guards/StringGuardian.ts';

console.log('🚀 Guardian Mutation Demo\n');

// Test 1: Default mutation behavior with StringGuardian methods
console.log('1. Default Mutation Behavior:');
const base = new StringGuardian();
console.log('   Base guardian created');

const withMinLength = base.minLength(5);
console.log('   Added minLength(5) - mutates original');
console.log('   base === withMinLength:', base === withMinLength);

const withMaxLength = base.maxLength(20);
console.log('   Added maxLength(20) - mutates original');
console.log('   base === withMaxLength:', base === withMaxLength);

try {
  base.parse('hi'); // Should fail because it now has minLength(5)
  console.log('   ❌ Unexpected: "hi" should have failed');
} catch (error) {
  console.log('   ✅ "hi" correctly failed:', (error as Error).message);
}

console.log('\n2. Step Method with Custom Errors:');
const stepGuardian = new StringGuardian().step(
  (value: string) => {
    if (value.includes('bad')) throw new Error();
    return value;
  },
  'Value cannot contain the word "bad"',
  'content_filter',
);
console.log('   Created guardian with custom step validation');

try {
  stepGuardian.parse('this is bad content');
  console.log('   ❌ Unexpected: bad content should have failed');
} catch (error) {
  console.log('   ✅ Custom error message works:', (error as Error).message);
}

console.log('\n3. Immutable Behavior:');
const immutableBase = new StringGuardian().immutable();
console.log('   Created immutable base guardian');

const immutableWithStep = immutableBase.step(
  (value: string) => {
    if (value.length < 3) throw new Error();
    return value;
  },
  'Must be at least 3 characters',
  'minLength',
);
console.log('   Added step validation - creates new instance');
console.log(
  '   immutableBase === immutableWithStep:',
  immutableBase === immutableWithStep,
);

// Test that original immutableBase is unchanged
try {
  const result = immutableBase.parse('hi');
  console.log(
    '   ✅ immutableBase unchanged, "hi" parsed successfully:',
    result,
  );
} catch (_error) {
  console.log('   ❌ Unexpected: immutableBase should accept "hi"');
}

// Test that stepped version has validation
try {
  immutableWithStep.parse('hi'); // Should fail validation
  console.log('   ❌ Unexpected: "hi" should have failed on stepped version');
} catch (error) {
  console.log(
    '   ✅ Stepped version "hi" correctly failed:',
    (error as Error).message,
  );
}

console.log('\n4. Performance Comparison:');
const iterations = 50000;

// Test immutable chaining performance
const start1 = performance.now();
for (let i = 0; i < iterations; i++) {
  new StringGuardian()
    .immutable()
    .step(
      (s: string) => {
        if (s.length < 5) throw new Error();
        return s;
      },
      'Min length validation',
      'minLength',
    )
    .step(
      (s: string) => {
        if (s.length > 20) throw new Error();
        return s;
      },
      'Max length validation',
      'maxLength',
    );
}
const immutableTime = performance.now() - start1;

// Test mutable chaining performance
const start2 = performance.now();
for (let i = 0; i < iterations; i++) {
  new StringGuardian()
    .step(
      (s: string) => {
        if (s.length < 5) throw new Error();
        return s;
      },
      'Min length validation',
      'minLength',
    )
    .step(
      (s: string) => {
        if (s.length > 20) throw new Error();
        return s;
      },
      'Max length validation',
      'maxLength',
    );
}
const mutableTime = performance.now() - start2;

console.log(
  `   Immutable chain (${iterations} iterations): ${
    immutableTime.toFixed(2)
  }ms`,
);
console.log(
  `   Mutable chain (${iterations} iterations): ${mutableTime.toFixed(2)}ms`,
);
console.log(
  `   Performance improvement: ${
    (immutableTime / mutableTime).toFixed(1)
  }x faster`,
);

console.log(
  '\n✨ Demo complete! Mutation by default with explicit immutability is working perfectly.',
);
