import { templatize } from './templatize.ts';

Deno.bench({
  name: 'utils.templatize - Parse template with variables',
}, () => {
  templatize('Hello, ${name}! Today is ${day}.');
});

const template = 'Hello, ${name}! Today is ${day}.';
const parser = templatize(template);
Deno.bench({
  name: 'utils.templatize - Assign values to variables',
}, () => {
  parser({ name: 'Alice', day: 'Monday' });
});

Deno.bench({
  name: 'utils.templatize - Parse template without variables',
}, () => {
  parser({} as unknown as { name: string; day: string });
});
