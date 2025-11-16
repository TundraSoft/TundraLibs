# GitHub Copilot Instructions for TundraLibs Monorepo

## Project Overview

TundraLibs is a Deno monorepo containing 9 independent utility libraries published to JSR. Each workspace is a separate package with its own versioning, testing, and publishing pipeline.

### Workspaces
- `@tundralibs/cacher` - Caching engines (Memory, Redis, Memcached)
- `@tundralibs/crypt` - Cryptographic utilities (JWT, Hash, Encrypt, Generators)
- `@tundralibs/dam` - Data Access Management layer
- `@tundralibs/guardian` - Data validation and transformation
- `@tundralibs/id` - ID generators (nanoID, ObjectID, ULID, sequenceID)
- `@tundralibs/norm` - Data normalization utilities
- `@tundralibs/openapi` - OpenAPI specification tools
- `@tundralibs/restler` - REST API client utilities
- `@tundralibs/slogger` - High-performance structured logging
- `@tundralibs/utils` - General utility functions

## Development Standards

### Code Style & Quality
- **TypeScript strict mode** - All compiler strict options enabled
- **Single quotes** - Use single quotes for strings
- **2-space indentation** - No tabs, consistent 2-space indentation
- **80 character line width** - Keep lines concise
- **Semicolons required** - Always use semicolons
- **JSDoc documentation** - All public APIs must have comprehensive JSDoc comments
- **No implicit any** - Explicit typing required

### Variable & Method Naming Conventions
- **camelCase** for variables: `defaultExpiry`, `maxRetries`, `variableName`
- **Protected methods/properties** - Prefix with single underscore: `_setOptions()`, `_handlers`
- **Private methods/properties** - Prefix with double underscore: `__memoized`, `__internal_state`
- **Global constants** - ALL_CAPS: `DEFAULT_EXPIRY`, `MAX_RETRIES`
- **Files** - PascalCase: `NanoID.ts`, `BaseError.ts`
- **Classes and types** - PascalCase: `AbstractEngine`, `CacheOptions`
- **Branches** - kebab-case: `feat/utils/add-cache-utility`

### Testing Standards
- **Test files**: `*.test.ts` suffix, co-located with source files in workspace root
- **Benchmark files**: `*.bench.ts` suffix for performance tests  
- **Test structure**: Use `Deno.test()` with descriptive names following workspace structure
- **Organized tests**: Main `Deno.test()` for entire file, then sub-steps for scenarios/use cases
- **Nested tests**: Use `await t.step()` for organized sub-tests and nested scenarios
- **Assertions**: Import from `$asserts` alias (jsr:@std/assert)
- **No external dependencies**: Use default Deno test suite only
- **Coverage requirement**: Minimum 80% test coverage
- **Sample sizes**: Use 10,000 iterations for collision/consistency tests
- **Utilities**: Use `@tundralibs/utils` for generic test utilities, `@tundralibs/restler` for mocking

### Test Organization Pattern
Tests follow the workspace structure and mirror the source file organization:

```typescript
import * as asserts from '$asserts';
import { myFunction } from './MyModule.ts';

Deno.test('workspace.moduleName', async (t) => {
  await t.step('scenario 1: basic functionality', async (t) => {
    await t.step('should handle valid input', () => {
      const result = myFunction('valid input');
      asserts.assertEquals(result, 'expected output');
    });
    
    await t.step('should handle edge cases', () => {
      asserts.assertThrows(() => myFunction(null));
    });
  });

  await t.step('scenario 2: advanced features', async (t) => {
    await t.step('should support complex operations', () => {
      // Test implementation
    });
    
    await t.step('should handle async operations', async () => {
      const result = await myAsyncFunction();
      asserts.assertEquals(result, expected);
    });
  });
});
```

### Benchmark Structure
```typescript
import { myFunction } from './MyModule.ts';

Deno.bench({
  name: 'workspace.moduleName - specific operation description',
}, () => {
  myFunction('test input');
});
```

## Workspace Structure

Each workspace must follow this structure:
```
workspace/
├── deno.json              # Package configuration
├── mod.ts                 # Main exports
├── README.md              # Documentation (REQUIRED)
├── .docs/                 # Full documentation folder (future wiki integration)
├── *.ts                   # Source files
├── tests/                 # Test directory (if multiple test files)
│   ├── *.test.ts          # Test files named as: filename.test.ts
│   └── *.bench.ts         # Benchmark files
├── types/                 # Type definitions (REQUIRED)
│   ├── mod.ts             # Type exports
│   └── *.ts               # Type definition files
├── errors/                # Error classes (for complex errors)
│   ├── mod.ts             # Error exports
│   └── *.ts               # Custom error classes
└── subdirectories/        # Sub-modules in their own folders
    ├── mod.ts             # Sub-module exports
    ├── *.ts               # Source files
    ├── types/             # Sub-module types (if needed)
    ├── errors/            # Sub-module errors (if needed)
    └── tests/             # Sub-module tests (if needed)
        └── *.test.ts
```

### Organizational Rules
- **Separate folders**: Use `types/`, `errors/`, `tests/` folders when multiple files exist
- **Single files**: If only 1 type or 1 error, keep in workspace root without separate folder
- **Nesting depth**: Maximum 2-3 levels deep (1 = root level)
- **Module exports**: Every folder MUST have `mod.ts` - all imports go through `mod.ts` files

### Types Organization
- **Individual files**: Keep separate file for each type for easier management
- **Naming convention**: 
  - File: `Options.ts` in `restler/types/` → Export: `RESTlerOptions`
  - File: `Options.ts` in `dam/engines/types/` → Export: `DAMMariaOptions`
- **Exceptions**: Complex interdependent types can share files; non-exported helper types can be co-located
- **Subdirectory limit**: Maximum 2 subdirectories for types

### Error Handling Structure
- **Error folders**: Create `errors/` folder only for complex or multiple error classes
- **Hierarchy**: Always have `Base.ts` in root error folder, all others inherit from it
- **Error codes**: Organize error codes as needed (flexible approach)

### Imports and Exports Structure
- **mod.ts requirement**: Every folder must export everything in that directory and subdirectories
- **Export order**: 
  1. Folders first (alphabetically)
  2. Then files (alphabetically)
- **Circular imports**: Avoid circular dependencies between modules in same workspace

### Configuration Files
- **External dependencies**: Always import external deps in workspace `deno.json`, not directly in files
- **Friendly names**: Use descriptive aliases in `deno.json` imports
- **Version locking**: Lock to specific versions when possible, use latest when not critical
- **Version numbering**: Handled by CI/CD pipeline (automated)

### Documentation Structure
- **README.md**: Basic introduction + listing of `.docs/` entry files
- **`.docs/` folder**: All files used for GitHub wiki integration
  - `examples/` - Usage examples
  - `guides/` - How-to guides  
  - `details/` - Detailed documentation
- **Code documentation**: Future automated extraction planned

### Dependency Management
- **Inter-workspace**: Always use latest version between TundraLibs workspaces
- **Shared utilities**: Evaluate based on functionality scope and reusability
- **Common patterns**: Use `@tundralibs/utils` for generic utilities, specific workspaces for domain logic

### Performance Guidelines
- **Universal performance**: Build ALL code for performance regardless of size or criticality
- **Benchmarks**: Group performance tests in `tests/` folder following same structure pattern
- **Optimization**: Consider performance implications in all design decisions

### Workspace Size and Scope
- **Functionality-driven**: Organize workspaces by functionality and modularity
- **Domain separation**: Keep related functionality together, separate distinct domains
- **No size limits**: Focus on logical boundaries rather than arbitrary size constraints
- **Modularity first**: Prioritize clean module boundaries over workspace size considerations

## Design Patterns & Architecture
- **Abstract Base Classes** - Use abstract classes for shared functionality (e.g., `AbstractEngine`, `AbstractHandler`)
- **Template Method Pattern** - Protected methods for customization points (e.g., `_makeMessage()`, `_handle()`)
- **Options Pattern** - Extend `Options<T>` class for configurable components with event handling
- **Decorator Pattern** - Method decorators for cross-cutting concerns (`@Singleton`, `@Memoize`, `@Throttle`)
- **Error Hierarchy** - All custom errors extend `BaseError` with context and chaining support
- **Factory Methods** - Static factory methods for object creation (e.g., `Guardian.string()`, `Guardian.number()`)
- **Composition over Inheritance** - Favor composition and mixins over deep inheritance hierarchies
- **Private Object Pattern** - Use `privateObject()` for internal state management with controlled access

## Documentation Requirements

### JSDoc Standards
- **All code must be documented** - This is an open source project requiring concise and accurate documentation
- **Required JSDoc tags**:
  - `@param` - All parameters with descriptions
  - `@returns` - Return value descriptions
  - `@throws` - Correct class linking for error types
  - `@example` - Usage examples (multiple for complex cases)
  - `@since` - Version information when applicable
  - `@deprecated` - Deprecation notices with alternatives
  - `@internal` - Internal-only methods/properties
  - `@async` - Indicate async methods clearly
- **Linking**: Use JSDoc linking (`{@link}`) to reference custom types, classes, and errors
- **Documentation depth**: Explain what the specific item does, avoid repeating architecture details, link to relevant sections

**JSDoc Example Pattern**:
```typescript
/**
 * Encrypts data using AES-256-GCM algorithm with automatic key derivation.
 *
 * This method provides authenticated encryption with associated data (AEAD)
 * ensuring both confidentiality and integrity of the encrypted payload.
 *
 * @param data - The plaintext data to encrypt
 * @param password - Master password for key derivation
 * @param options - {@link EncryptionOptions} Configuration options
 * @returns Promise resolving to {@link EncryptedData} with ciphertext and metadata
 * @throws {CryptError} When encryption fails or invalid parameters provided
 * @since 1.0.0
 * @async
 * @example Simple encryption:
 * ```typescript
 * const encrypted = await encrypt('sensitive data', 'strong-password');
 * console.log(encrypted.ciphertext);
 * ```
 * @example With custom options:
 * ```typescript
 * const encrypted = await encrypt('data', 'password', {
 *   keyDerivation: 'pbkdf2',
 *   iterations: 100000
 * });
 * ```
 */
```

### README.md Structure
Each workspace README must follow this structure:
1. **Introduction** - Brief library overview
2. **Quick Start** - Simple usage example
3. **Core Documentation Link** - Link to `.docs/INDEX.md`
4. **Special Notes** - Edge cases, warnings, guidelines (if applicable)
5. **Navigation** - Back link to main repository README.md
6. **Footer** - License and links

**README.md Template**:
```markdown
# [Workspace Name]

Brief description of the workspace and its purpose.

## Quick Start

```typescript
// Simple usage example
import { feature } from '@tundralibs/workspace';
const result = feature('example');
```

## Documentation

For comprehensive documentation, examples, and API reference, see [Documentation](.docs/INDEX.md).

## Special Considerations

- Edge case warnings
- Usage guidelines
- Performance notes (optional)

## Navigation

← [Back to TundraLibs](../README.md)
```

### .docs/ Folder Organization
- **Structure**: `examples/`, `guides/`, `api/` folders as needed
- **Naming**: PascalCase with expressive names (`GettingStarted.md`, `AdvancedUsage.md`)
- **Navigation**: Each file must have clear navigation links
  - `INDEX.md` - Main documentation index linking to all sections
  - Hierarchical navigation (folder index → specific guides → back links)
- **Cross-references**: Link between related documentation sections

**Documentation Navigation Pattern**:
```markdown
# Advanced Usage Guide

← [Back to Guides Index](./INDEX.md) | [Documentation Home](../INDEX.md)

## Content here...

---
**Navigation**: [Simple Usage](./SimpleUsage.md) | [API Reference](../api/README.md)
```

### API Documentation Patterns
- **Class hierarchies**: Document inheritance patterns and implementation requirements
- **Generic types**: Describe type parameters clearly
- **Decorators**: Mention caching behavior, singleton patterns, memory implications
- **Factory methods**: Document static constructors and creation patterns
- **Async methods**: Clearly indicate async behavior and Promise returns

### Performance Documentation
- **Location**: Separate file in `.docs/Performance.md` for performance-critical workspaces
- **Benchmark results**: Include if automated generation is available
- **Characteristics**: Document time/space complexity when relevant

### Error Documentation
- **Error handling**: Include error handling patterns in API documentation
- **Error codes**: Provide comprehensive list with explanations and messages
- **Context**: Document error context and chaining patterns

### Event Documentation
- **Event listings**: Document all available events and their triggers
- **Event patterns**: Explain event-driven API usage patterns
- **Handlers**: Document event handler signatures and behaviors

### Code Examples and Testing
- **Runnable examples**: Use Deno's `deno test --doc` capability for testing JSDoc examples
- **Example complexity**: Progress from basic usage to advanced scenarios
- **Import patterns**: Use full JSR imports in documentation examples
- **Error handling**: Include error handling patterns in complex examples
- **Maintenance**: Keep examples synchronized with code changes

### Migration and Changelog
- **Breaking changes**: Document migration paths for major version changes
- **Deprecation**: Provide clear alternatives and timelines for deprecated features
- **Upgrade guides**: Include step-by-step upgrade instructions when needed

### Security Documentation
- **Cryptographic functions**: Include security considerations and best practices
- **Warnings**: Document security implications and proper usage patterns

## Development Workflow

### Branch Strategy
- **One workspace per branch** - Only modify a single workspace per feature branch
- **No cross-workspace changes** - Separate PRs required for changes affecting multiple workspaces
- **Branch lifecycle**: Create → develop → test → review → merge → auto-publish
- **No publishing during development** - JSR publishing only occurs on merge to main

### Branch & Commit Standards
- **Branch naming**: `<type>/<workspace>/<description>`
  - Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`
  - Examples: `feat/utils/add-cache-utility`, `fix/id/nanoid-collision`
- **Conventional commits**: Required for automatic versioning
  - Format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`
  - Scope: workspace name (utils, id, crypt, etc.)
  - Breaking changes: Add `BREAKING:` to trigger major version bump

### Quality Gates & Testing
- **Pre-commit hooks**: 
  - Code formatting (`deno fmt`)
  - Linting (`deno lint`)  
  - Test execution (all tests must pass)
  - Benchmark execution (performance regression checks)
- **Branch testing requirements**:
  - All tests must pass
  - Coverage threshold must be met (fail if below minimum)
  - Benchmark performance must not regress beyond threshold
  - Modified workspace coverage must be >90% (source code only, excludes tests)
- **CI/CD validation**: All quality gates enforced in continuous integration

### Code Review Process
- **Single workspace focus** - Reviews concentrate on one workspace per PR
- **Quality validation** - All automated checks must pass before review
- **Documentation updates** - Required for new features and API changes
- **Performance impact** - Benchmark results reviewed for critical workspaces

### Publishing Strategy
- **Automated versioning** - Based on conventional commit types using `@deno/bump-workspaces`:
  - `fix`, `perf`, `docs`, `refactor`, `test`, `style`, `chore` = patch version (1.0.0 → 1.0.1)
  - `feat` = minor version (1.0.0 → 1.1.0) 
  - `BREAKING` = major version (1.0.0 → 2.0.0)
- **Edge releases** - Automatic on PR creation with format `1.0.0-edge.123.abc1234` (PR# + commit SHA)
- **JSR publishing** - Only changed workspaces published on merge to main
- **Independent versioning** - Each workspace maintains its own semantic version
- **Changelog automation** - CHANGELOG.md automatically updated with PR information and version numbers

### Release Process Pipeline
The automated release pipeline consists of 5 sequential jobs triggered when PRs are merged to main:

1. **Change Detection** - Identifies workspace changes by comparing PR commits against workspace directories
2. **Changelog Update** - Creates CHANGELOG.md entries categorized by conventional commit type:
   - `feat` → "### Added"
   - `fix` → "### Fixed" 
   - `perf` → "### Performance"
   - `docs` → "### Documentation"
   - `BREAKING` → "### BREAKING CHANGES"
   - Others → "### Changed"
3. **Version Bumping** - Uses `@deno/bump-workspaces` to increment versions based on commit type
4. **Changelog Finalization** - Replaces "[Unreleased]" with actual version numbers (e.g., "workspace@1.2.0")
5. **JSR Publishing** - Publishes only changed workspaces to JSR registry
6. **GitHub Release** - Creates tagged release with changelog and affected workspace information

**Pipeline Triggers:**
- **Automatic**: PR merged to main with workspace file changes
- **Manual**: Workflow dispatch with force_release option
- **Skipped**: PRs with only `.github/`, documentation, or non-workspace changes

**Edge Release System:**
- **Trigger**: PR opened/updated against main branch
- **Versioning**: `current-version-edge.PR#.commit-hash` (e.g., `1.0.0-edge.123.abc1234`)
- **Publishing**: Only changed workspaces get edge versions
- **PR Comments**: Automatic installation instructions for testing edge versions
- **Usage**: Perfect for testing PR changes before merge

### Development Environment
- **VS Code configuration** - Standardized settings in `.vscode/` folder
- **Dev containers** - Consistent development environment via `.devcontainer/`
- **Deno version** - Specific version requirements managed through configuration
- **Extensions** - Recommended VS Code extensions for optimal development experience

## Import Patterns
- **Use aliases** defined in root `deno.json`:
  - `$asserts` for `jsr:@std/assert`
  - `$testing` for `jsr:@std/testing`
  - `$fs` for `jsr:@std/fs`
  - `$path` for `jsr:@std/path`
- **Cross-workspace imports**: Use JSR imports `@tundralibs/package`
- **Relative imports**: Use `./` and `../` for same-workspace files
- **Export organization**: Re-export from `mod.ts` files

## Error Handling
- **Extend BaseError**: Use `@tundralibs/utils/BaseError` for custom errors
- **Error context**: Include relevant context data in errors
- **Message templating**: Support variable substitution in error messages
- **Error chaining**: Use `cause` property for nested errors

Example error implementation:
```typescript
import { BaseError } from '@tundralibs/utils';

export class MyCustomError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context, { name: 'MyCustomError' });
  }
}
```

## Performance Considerations
- **Benchmarks required** for performance-critical code
- **No regressions >10%** allowed in benchmarks
- **Memory efficiency** - Avoid unnecessary allocations
- **Lazy loading** - Defer expensive operations when possible
- **Caching strategies** - Use memoization for expensive computations

## Security Requirements
- **Input validation** for all external inputs
- **No secrets** in code or configuration
- **Dependency scanning** - All deps must be vulnerability-free
- **Trivy security scans** must pass
- **Follow OWASP guidelines** for security-sensitive code

## CI/CD Pipeline
- **Quality gates**: All code must pass formatting, linting, type checking
- **Multi-platform testing**: Ubuntu, Windows, macOS with Deno v2.x and canary
- **Test coverage**: Minimum 80% coverage required, >90% for modified workspaces
- **Performance monitoring**: Benchmark regression detection with >10% threshold
- **Security scans**: Trivy vulnerability scanning (filesystem, repository, config)
- **Automated releases**: 5-stage pipeline based on conventional commits
- **Edge releases**: Bleeding-edge versions for PR testing
- **JSR publishing**: Only changed workspaces published with proper versioning
- **GitHub integration**: PR title validation, automatic labeling, release creation

## Common Tasks

### Adding a New Feature
1. Create feature branch: `feat/<workspace>/<description>`
2. Implement with tests and documentation
3. Run quality checks: `deno task check && deno task test`
4. Commit with conventional format
5. Create PR with clear description

### Adding a New Workspace
1. Use: `deno task workspace:add <name>`
2. Follow template structure
3. Update root `deno.json` workspace array
4. Add to GitHub issue templates and workflows

### Emergency Publishing

For critical hotfixes that need immediate publishing:

```bash
# Via GitHub CLI
gh workflow run publish.yaml \
  --field workspace=utils \
  --field dryRun=false \
  --field reason="Critical security vulnerability fix"
```

**When to Use Emergency Publish:**
- Critical security vulnerabilities
- Severe bugs affecting production users
- Broken releases that need immediate rollback

**Emergency Publish Process:**
1. **Always dry-run first** - Test with `dryRun=true`
2. **Document the reason** - Required field explaining the emergency
3. **Track automatically** - Creates GitHub issue for follow-up
4. **Follow-up actions** - Update CHANGELOG.md and plan proper release

## Quality Assurance

Run these commands before every commit:
```bash
deno task check          # Format, lint, type check
deno task test           # Full test suite with coverage
deno task bench          # Performance benchmarks (if changed)
deno task security:all   # Security vulnerability scan
```

## Best Practices

1. **One workspace per PR** - Focus changes on single packages
2. **Test-driven development** - Write tests before implementation
3. **Performance awareness** - Consider performance implications
4. **Security first** - Always validate inputs and handle errors
5. **Documentation driven** - Document APIs before implementation
6. **Conventional commits** - Enable automatic versioning
7. **Code review** - All changes require review
8. **Quality gates** - Never bypass CI/CD requirements

## Resources

- [Contributing Guide](../CONTRIBUTING.md) - Detailed development workflow
- [JSR Registry](https://jsr.io/@tundralibs) - Published packages
- [GitHub Workflows](./workflows/) - CI/CD pipeline details
- [Issue Templates](./ISSUE_TEMPLATE/) - Bug reports and features