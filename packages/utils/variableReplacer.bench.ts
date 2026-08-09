import { variableReplacer } from './variableReplacer.ts';

Deno.bench({
  name: 'utils.variableReplacer - Replace variables in string',
}, () => {
  variableReplacer(
    'Hello ${user.firstName} ${user.lastName}, your ID is ${user.id}',
    {
      user: {
        firstName: 'John',
        lastName: 'Doe',
        id: 12345,
      },
    },
  );
});

Deno.bench({
  name: 'utils.variableReplacer - Replace variables with nested objects',
}, () => {
  variableReplacer(
    'Project: ${project.name} (${project.details.status})',
    {
      project: {
        name: 'TundraLibs',
        details: {
          status: 'Active',
          owner: 'TundraSoft',
          lastUpdated: new Date(),
        },
      },
    },
  );
});

// Custom-delimiter path uses a hand-rolled regex scanner instead of
// templatize. Bench separately so we can see the gap.
const handlebarsRe = /\{\{([^{}]+)\}\}/g;
Deno.bench({
  name: 'utils.variableReplacer - Custom regex (handlebars {{...}})',
}, () => {
  variableReplacer(
    'Hello {{user.firstName}} {{user.lastName}}, ID {{user.id}}',
    { user: { firstName: 'John', lastName: 'Doe', id: 12345 } },
    handlebarsRe,
  );
});
