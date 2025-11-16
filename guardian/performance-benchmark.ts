#!/usr/bin/env -S deno run --allow-hrtime

import { Guardian } from './Guardian.ts';

// Benchmark different approaches to understand performance implications

function measureTime<T>(name: string, fn: () => T, iterations = 100000): T {
  const start = performance.now();
  let result: T;

  for (let i = 0; i < iterations; i++) {
    result = fn();
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;

  console.log(`${name}:`);
  console.log(`  Total: ${totalTime.toFixed(2)}ms`);
  console.log(`  Average: ${avgTime.toFixed(6)}ms per operation`);
  console.log(
    `  Rate: ${(iterations / (totalTime / 1000)).toFixed(0)} ops/sec\n`,
  );

  return result!;
}

console.log('🚀 Guardian Performance Benchmark\n');

// Test 1: Object creation overhead
console.log('=== Test 1: Object Creation Patterns ===');

measureTime('Simple object creation', () => {
  return { a: 1, b: 2, c: 3, d: 4, e: 5 };
});

measureTime('Object.setPrototypeOf creation', () => {
  const obj = Object.setPrototypeOf({
    a: 1,
    b: 2,
    c: 3,
    d: 4,
    e: 5,
  }, Object.prototype);
  return obj;
});

measureTime('Property copying (5 props)', () => {
  const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  const target: Record<string, number> = {};
  for (const key in source) {
    target[key] = source[key as keyof typeof source];
  }
  return target;
});

measureTime('Object.getOwnPropertyNames + defineProperty', () => {
  const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  const target: Record<string, number> = {};
  const props = Object.getOwnPropertyNames(source);
  for (const prop of props) {
    const descriptor = Object.getOwnPropertyDescriptor(source, prop);
    if (descriptor) {
      Object.defineProperty(target, prop, descriptor);
    }
  }
  return target;
});

// Test 2: Guardian creation patterns
console.log('=== Test 2: Guardian Creation Patterns ===');

// Current approach (with _createStep)
measureTime('Current: _createStep approach', () => {
  return Guardian.string().minLength(5).maxLength(10);
});

// Simulate mutation approach
class MutableGuardian {
  private _steps: Array<(x: unknown) => unknown> = [];

  constructor(initialStep: (x: unknown) => unknown) {
    this._steps.push(initialStep);
  }

  step(fn: (x: unknown) => unknown) {
    this._steps.push(fn);
    return this;
  }

  minLength(min: number) {
    return this.step((x: unknown) => {
      const str = x as string;
      if (str.length < min) throw new Error('Too short');
      return str;
    });
  }

  maxLength(max: number) {
    return this.step((x: unknown) => {
      const str = x as string;
      if (str.length > max) throw new Error('Too long');
      return str;
    });
  }
}

measureTime('Mutation approach (hypothetical)', () => {
  return new MutableGuardian((x) => x).minLength(5).maxLength(10);
});

// Test 3: Method chaining depth
console.log('=== Test 3: Method Chaining Depth Impact ===');

measureTime('Short chain (2 methods)', () => {
  return Guardian.string().minLength(5);
});

measureTime('Medium chain (4 methods)', () => {
  return Guardian.string().minLength(5).maxLength(10).trim().toUpperCase();
});

measureTime('Long chain (8 methods)', () => {
  return Guardian.string()
    .minLength(5)
    .maxLength(10)
    .trim()
    .toUpperCase()
    .step((x: string) => x + '!')
    .step((x: string) => x.replace('!', '?'))
    .step((x: string) => x.toLowerCase())
    .step((x: string) => x.trim());
});

// Test 4: Validation performance (parsing)
console.log('=== Test 4: Validation Performance ===');

const simpleGuardian = Guardian.string().minLength(5);
const complexGuardian = Guardian.string()
  .minLength(5)
  .maxLength(50)
  .trim()
  .toUpperCase();

measureTime('Simple validation', () => {
  return simpleGuardian.parse('hello world');
});

measureTime('Complex validation', () => {
  return complexGuardian.parse('hello123');
});

// Test 5: Memory usage simulation
console.log('=== Test 5: Memory Pressure ===');

measureTime('Create 1000 guardians (current)', () => {
  const guardians = [];
  for (let i = 0; i < 1000; i++) {
    guardians.push(Guardian.string().minLength(i % 10).maxLength(i % 20 + 10));
  }
  return guardians.length;
}, 100);

console.log('✅ Benchmark complete!');
