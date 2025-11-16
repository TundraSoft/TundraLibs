#!/usr/bin/env -S deno run

import { Guardian } from './Guardian.ts';

async function testAsyncFix() {
  console.log('Testing BaseGuardian async detection fix:\n');

  // Test 1: Sync step should work
  console.log('=== Test 1: Sync Step ===');
  const syncSchema = Guardian.string().step((value: string) => {
    console.log('  Sync step called with:', value);
    return value.toUpperCase();
  });

  try {
    const result = syncSchema.parse('hello');
    console.log('✅ Sync result:', result);
  } catch (error) {
    console.log('❌ Sync error:', (error as Error).message);
  }

  // Test 2: Async step should be detected and work with parseAsync
  console.log('\n=== Test 2: Async Step Detection and Execution ===');
  const asyncSchema = Guardian.string().step(async (value: string) => {
    console.log('  Async step called with:', value);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return value.toUpperCase();
  });

  // Should detect async and prevent sync parsing
  try {
    asyncSchema.parse('test');
    console.log('❌ Should have prevented sync parsing');
  } catch (error) {
    console.log(
      '✅ Correctly prevented sync parsing:',
      (error as Error).message,
    );
  }

  // Should work with async parsing
  try {
    const result = await asyncSchema.parseAsync('world');
    console.log('✅ Async result:', result);
  } catch (error) {
    console.log('❌ Async error:', (error as Error).message);
  }

  // Test 3: ObjectGuardian with async step
  console.log('\n=== Test 3: ObjectGuardian Async Integration ===');
  const objSchema = Guardian.object({
    name: Guardian.string(),
  }).step(async (data) => {
    console.log('  Object async step called with:', data);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ...data, processed: true };
  });

  // Check if async detected
  console.log(
    '  ObjectGuardian _isAsync:',
    (objSchema as unknown as { _isAsync: boolean })._isAsync,
  );

  try {
    const result = await objSchema.parseAsync({ name: 'test' });
    console.log('✅ Object async result:', result);
  } catch (error) {
    console.log('❌ Object async error:', (error as Error).message);
  }

  console.log('\n🎉 Async fix verification complete!');
}

testAsyncFix().catch(console.error);
