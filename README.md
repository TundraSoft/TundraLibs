# 🏔️ TundraLibs

[![Test](https://github.com/tundralibs/tundralibs/actions/workflows/test.yaml/badge.svg)](https://github.com/tundralibs/tundralibs/actions/workflows/test.yaml)
[![Benchmark](https://github.com/tundralibs/tundralibs/actions/workflows/benchmark.yaml/badge.svg)](https://github.com/tundralibs/tundralibs/actions/workflows/benchmark.yaml)
[![JSR](https://jsr.io/badges/@tundralibs)](https://jsr.io/@tundralibs)

A collection of high-quality, well-tested TypeScript utilities for Deno,
organized as a modern monorepo with automatic releases and performance tracking.

## 📦 Packages

| Package                       | Version                                         | Description                                                 |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| [@tundralibs/crypt](./crypt/) | ![JSR](https://jsr.io/badges/@tundralibs/crypt) | Cryptographic utilities (encryption, hashing, signing, OTP) |
| [@tundralibs/id](./id/)       | ![JSR](https://jsr.io/badges/@tundralibs/id)    | ID generation utilities (UUID, ULID, NanoID, ObjectID)      |
| [@tundralibs/utils](./utils/) | ![JSR](https://jsr.io/badges/@tundralibs/utils) | General utilities (caching, throttling, events, config)     |

## 🚀 Quick Start

### Installation

```bash
# Install stable versions (recommended)
deno add @tundralibs/crypt
deno add @tundralibs/id  
deno add @tundralibs/utils

# Install bleeding edge versions (for testing)
deno add @tundralibs/crypt@1.0.0-edge.123.abc1234
deno add @tundralibs/id@2.1.0-edge.124.def5678
deno add @tundralibs/utils@1.5.0-edge.125.ghi9012

# Or install all packages
deno add @tundralibs/crypt @tundralibs/id @tundralibs/utils
```

> **🚀 Edge Versions**: Every PR automatically publishes edge versions (e.g.,
> `@1.2.0-edge.123.abc1234`) for testing new features before they're released.
> Perfect for early adopters and contributors!

### Usage Examples

```typescript
// Cryptographic operations
import { decrypt, digest, encrypt, TOTP } from "@tundralibs/crypt";

// Generate TOTP code
const secret = "JBSWY3DPEHPK3PXP";
const code = TOTP(secret);
console.log(code); // 6-digit TOTP code

// Encrypt/decrypt data
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,
  ["encrypt", "decrypt"],
);
const encrypted = await encrypt("Hello World", key);
const decrypted = await decrypt(encrypted, key);
```

```typescript
// ID generation
import { nanoID, ObjectID, ULID } from "@tundralibs/id";

// Generate various ID types
const nano = nanoID(); // URL-safe, customizable
const ulid = ULID(); // Sortable, timestamp-based
const objectId = ObjectID(); // MongoDB-style ObjectID
```

```typescript
// Utility functions
import { Events, memoize, throttle } from "@tundralibs/utils";

// Throttle function calls
const throttledFn = throttle(() => {
  console.log("Called at most once per second");
}, 1000);

// Memoize expensive operations
const memoizedFn = memoize((x: number) => {
  return x * x; // Expensive calculation
});

// Event handling
const events = new Events<{ userLogin: { userId: string } }>();
events.on("userLogin", ({ userId }) => {
  console.log(`User ${userId} logged in`);
});
```

## 🛠️ Development

### Prerequisites

- [Deno](https://deno.land/) v2.x or higher
- [Git](https://git-scm.com/) for version control

### Development Setup

```bash
# Clone the repository
git clone https://github.com/tundralibs/tundralibs.git
cd tundralibs

# Run quality checks
deno task check

# Run tests with coverage
deno task test

# Run benchmarks
deno task bench
```

### Available Commands

```bash
# Quality & Testing
deno task check              # Run all checks (format, lint, types)
deno task test               # Full test suite with coverage
deno task bench              # Performance benchmarks

# Individual checks
deno task check:fmt          # Code formatting
deno task check:lint         # Linting
deno task check:types        # Type checking
deno task test:run           # Tests only
deno task test:bench         # Benchmarks only
```

## 📖 Documentation

- **[Contributing Guide](./CONTRIBUTING.md)** - Comprehensive development
  workflow
- **[Changelog](./CHANGELOG.md)** - Release history and changes
- **[API Documentation](https://jsr.io/@tundralibs)** - Complete API reference

## 🔄 Development Workflow

### Branch Strategy

- **One workspace per PR** - Focus on single package changes
- **Conventional commits** - Required for automatic releases
- **Automated testing** - All changes must pass quality gates

### Example Workflow

```bash
# 1. Create feature branch
git checkout -b feat/utils/add-cache-utility

# 2. Make changes and test
deno task check && deno task test

# 3. Commit with conventional format
git commit -m "feat(utils): Add LRU cache with TTL support"

# 4. Push and create PR
git push origin feat/utils/add-cache-utility
```

### Release Process

- **Automated releases** - Triggered by PR merges to main
- **Semantic versioning** - Based on conventional commit types
- **Changelog generation** - Automatic with PR information
- **JSR publishing** - Only changed packages are published

## 🚨 Emergency Publishing

For critical hotfixes:

```bash
# Via GitHub CLI
gh workflow run publish.yaml \
  --field workspace=utils \
  --field dryRun=false \
  --field reason="Critical security vulnerability fix"
```

## 📊 Quality & Performance

### Automated Quality Gates

- ✅ **TypeScript strict mode** - Maximum type safety
- ✅ **Comprehensive testing** - Unit, integration, and benchmark tests
- ✅ **Code coverage tracking** - Integrated with CodeCov
- ✅ **Performance monitoring** - Automatic regression detection
- ✅ **Security scanning** - SonarQube integration

### Performance Benchmarks

- **Continuous benchmarking** - Every PR and main branch push
- **Regression detection** - Automatic alerts for >10% performance drops
- **Historical tracking** - Performance trends over time

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md)
for detailed information about:

- **Development setup** and workflow
- **Branch naming** and PR guidelines
- **Adding new workspaces** to the monorepo
- **Release process** and emergency publishing
- **Quality standards** and testing requirements

### Quick Contribution Checklist

- [ ] Fork the repository
- [ ] Create a feature branch (`feat/workspace/description`)
- [ ] Follow conventional commit format
- [ ] Add tests for new functionality
- [ ] Ensure all quality checks pass
- [ ] Update documentation as needed
- [ ] Submit PR with clear description

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

## 🔗 Links

- **[JSR Registry](https://jsr.io/@tundralibs)** - Package registry
- **[GitHub](https://github.com/tundralibs/tundralibs)** - Source code
- **[Issues](https://github.com/tundralibs/tundralibs/issues)** - Bug reports
  and feature requests
- **[Discussions](https://github.com/tundralibs/tundralibs/discussions)** -
  Community discussions

## 🙏 Acknowledgments

Built with ❤️ using:

- [Deno](https://deno.land/) - Modern JavaScript/TypeScript runtime
- [JSR](https://jsr.io/) - JavaScript package registry
- [GitHub Actions](https://github.com/features/actions) - CI/CD automation

---

**Made with 🏔️ by the TundraLibs team**
