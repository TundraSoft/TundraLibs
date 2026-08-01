import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { Guardian } from '../mod.ts';

describe('guardian.Markdown', () => {
  describe('StringGuardian markdown', () => {
    it('should generate basic markdown for string', () => {
      const markdown = Guardian.string().describe({
        title: 'Username',
        description: 'User login identifier',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Username'));
      asserts.assert(markdown.includes('User login identifier'));
      asserts.assert(markdown.includes('**Type:** string'));
    });

    it('should include examples in markdown', () => {
      const markdown = Guardian.string().describe({
        title: 'Email',
        description: 'User email address',
        examples: ['john@example.com', 'jane@test.org'],
      }).toMarkdown();

      asserts.assert(markdown.includes('**Examples:**'));
      asserts.assert(markdown.includes('"john@example.com"'));
      asserts.assert(markdown.includes('"jane@test.org"'));
    });

    it('should show deprecated warning', () => {
      const markdown = Guardian.string().describe({
        title: 'Old Field',
        description: 'This field is deprecated',
        deprecated: true,
      }).toMarkdown();

      asserts.assert(markdown.includes('⚠️'));
      asserts.assert(markdown.includes('Deprecated'));
    });

    it('should include format information', () => {
      const markdown = Guardian.string().email().describe({
        title: 'Email Address',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Email Address'));
      asserts.assert(markdown.includes('string'));
    });
  });

  describe('NumberGuardian markdown', () => {
    it('should generate markdown for number', () => {
      const markdown = Guardian.number().describe({
        title: 'Age',
        description: 'User age in years',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Age'));
      asserts.assert(markdown.includes('User age in years'));
      asserts.assert(markdown.includes('**Type:** number'));
    });

    it('should include min/max constraints in description', () => {
      const markdown = Guardian.number()
        .min(0)
        .max(120)
        .describe({
          title: 'Age',
          description: 'Must be between 0 and 120',
        })
        .toMarkdown();

      asserts.assert(markdown.includes('Must be between 0 and 120'));
    });

    it('should show integer constraint', () => {
      const markdown = Guardian.number().integer().describe({
        title: 'Count',
        description: 'Number of items',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Count'));
      asserts.assert(markdown.includes('Number of items'));
    });
  });

  describe('BooleanGuardian markdown', () => {
    it('should generate markdown for boolean', () => {
      const markdown = Guardian.boolean().describe({
        title: 'Active',
        description: 'Whether the account is active',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Active'));
      asserts.assert(markdown.includes('Whether the account is active'));
      asserts.assert(markdown.includes('**Type:** boolean'));
    });

    it('should include examples for boolean', () => {
      const markdown = Guardian.boolean().describe({
        title: 'Is Admin',
        examples: [true, false],
      }).toMarkdown();

      asserts.assert(markdown.includes('**Examples:**'));
      asserts.assert(markdown.includes('true'));
      asserts.assert(markdown.includes('false'));
    });
  });

  describe('ArrayGuardian markdown', () => {
    it('should generate markdown for array', () => {
      const markdown = Guardian.array(Guardian.string()).describe({
        title: 'Tags',
        description: 'User tags',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Tags'));
      asserts.assert(markdown.includes('User tags'));
      asserts.assert(markdown.includes('array'));
    });

    it('should show array constraints', () => {
      const markdown = Guardian.array(Guardian.number())
        .minLength(1)
        .maxLength(10)
        .describe({
          title: 'Numbers',
          description: '1-10 numbers required',
        })
        .toMarkdown();

      asserts.assert(markdown.includes('1-10 numbers required'));
    });
  });

  describe('ObjectGuardian markdown', () => {
    it('should generate markdown for object', () => {
      const markdown = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      }).describe({
        title: 'User',
        description: 'User information',
      }).toMarkdown();

      asserts.assert(markdown.includes('### User'));
      asserts.assert(markdown.includes('User information'));
    });

    it('should handle nested objects', () => {
      const markdown = Guardian.object({
        user: Guardian.object({
          name: Guardian.string(),
          email: Guardian.string().email(),
        }),
      }).describe({
        title: 'Profile',
        description: 'User profile data',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Profile'));
      asserts.assert(markdown.includes('User profile data'));
    });
  });

  describe('DateGuardian markdown', () => {
    it('should generate markdown for date', () => {
      const markdown = Guardian.date().describe({
        title: 'Birth Date',
        description: 'Date of birth',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Birth Date'));
      asserts.assert(markdown.includes('Date of birth'));
    });

    it('should show date format', () => {
      const markdown = Guardian.date().dateOnly().describe({
        title: 'Meeting Date',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Meeting Date'));
    });
  });

  describe('EnumGuardian markdown', () => {
    it('should generate markdown for enum', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const markdown = Guardian.enum(colors).describe({
        title: 'Color',
        description: 'Choose a color',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Color'));
      asserts.assert(markdown.includes('Choose a color'));
    });

    it('should show enum values in examples', () => {
      const sizes = ['small', 'medium', 'large'] as const;
      const markdown = Guardian.enum(sizes).describe({
        title: 'Size',
        examples: ['small', 'large'],
      }).toMarkdown();

      asserts.assert(markdown.includes('**Examples:**'));
      asserts.assert(markdown.includes('"small"'));
      asserts.assert(markdown.includes('"large"'));
    });
  });

  describe('BigIntGuardian markdown', () => {
    it('should generate markdown for bigint', () => {
      const markdown = Guardian.bigint().describe({
        title: 'Large Number',
        description: 'A very large integer',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Large Number'));
      asserts.assert(markdown.includes('A very large integer'));
    });
  });

  describe('UnknownGuardian markdown', () => {
    it('should generate markdown for unknown type', () => {
      const markdown = Guardian.unknown().describe({
        title: 'Flexible Data',
        description: 'Any type of data',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Flexible Data'));
      asserts.assert(markdown.includes('Any type of data'));
    });
  });

  describe('RecordGuardian markdown', () => {
    it('should generate markdown for record', () => {
      const markdown = Guardian.record(
        Guardian.string(),
        Guardian.number(),
      ).describe({
        title: 'Scores',
        description: 'User scores by category',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Scores'));
      asserts.assert(markdown.includes('User scores by category'));
    });
  });

  describe('Complex markdown scenarios', () => {
    it('should handle markdown without title', () => {
      const markdown = Guardian.string().describe({
        description: 'Just a description',
      }).toMarkdown();

      asserts.assert(markdown.includes('Just a description'));
      asserts.assert(markdown.includes('**Type:** string'));
    });

    it('should handle markdown with all metadata', () => {
      const markdown = Guardian.string().describe({
        title: 'Full Example',
        description: 'Complete metadata example',
        examples: ['example1', 'example2'],
        default: 'default',
        deprecated: false,
      }).toMarkdown();

      asserts.assert(markdown.includes('### Full Example'));
      asserts.assert(markdown.includes('Complete metadata example'));
      asserts.assert(markdown.includes('**Examples:**'));
    });

    it('should generate markdown for complex nested structure', () => {
      const markdown = Guardian.object({
        user: Guardian.object({
          name: Guardian.string().describe({
            title: 'Name',
            description: 'User full name',
          }),
          emails: Guardian.array(Guardian.string().email()),
          settings: Guardian.record(
            Guardian.string(),
            Guardian.unknown(),
          ),
        }),
      }).describe({
        title: 'User Profile',
        description: 'Complete user profile',
      }).toMarkdown();

      asserts.assert(markdown.includes('### User Profile'));
      asserts.assert(markdown.includes('Complete user profile'));
    });

    it('should handle empty description gracefully', () => {
      const markdown = Guardian.number().describe({
        title: 'Just Title',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Just Title'));
      asserts.assert(markdown.includes('**Type:** number'));
    });

    it('should format multiple examples correctly', () => {
      const markdown = Guardian.string().describe({
        title: 'Status',
        examples: ['pending', 'approved', 'rejected', 'cancelled'],
      }).toMarkdown();

      asserts.assert(markdown.includes('**Examples:**'));
      asserts.assert(markdown.includes('"pending"'));
      asserts.assert(markdown.includes('"approved"'));
      asserts.assert(markdown.includes('"rejected"'));
      asserts.assert(markdown.includes('"cancelled"'));
    });
  });

  describe('Markdown edge cases', () => {
    it('should escape special markdown characters in description', () => {
      const markdown = Guardian.string().describe({
        title: 'Special Chars',
        description: 'This has *asterisks* and _underscores_ and `backticks`',
      }).toMarkdown();

      asserts.assert(markdown.includes('This has'));
    });

    it('should handle very long descriptions', () => {
      const longDesc = 'A'.repeat(500);
      const markdown = Guardian.string().describe({
        title: 'Long',
        description: longDesc,
      }).toMarkdown();

      asserts.assert(markdown.includes('### Long'));
      asserts.assert(markdown.length > 500);
    });

    it('should handle nullable in markdown', () => {
      const markdown = Guardian.string().nullable().describe({
        title: 'Nullable Field',
        description: 'Can be null',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Nullable Field'));
      asserts.assert(markdown.includes('Can be null'));
    });

    it('should handle optional in markdown', () => {
      const markdown = Guardian.string().optional().describe({
        title: 'Optional Field',
        description: 'Can be undefined',
      }).toMarkdown();

      asserts.assert(markdown.includes('### Optional Field'));
      asserts.assert(markdown.includes('Can be undefined'));
    });
  });
});
