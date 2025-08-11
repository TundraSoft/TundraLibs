- Optimize the create method
- Maybe stick to using getType for create method validation. Also if this is the case, we should enhance it to support for the loose typing in JS
- Rework on the GuardianError
- NaN is being reported as number in getType.

## Enhancement Ideas

### High Priority

- **Conditional Validations**: Allow validation rules to depend on other field values
  - Example: shipping address required only for physical products
  - Implementation: Add `.when()` method with condition logic
  - Impact: Handles complex business rules elegantly

- **Property-Based Testing (QuickCheck Style)**: Generate random test data to verify validation properties
  - Example: Test that all valid strings pass string validation
  - Implementation: Integration with fast-check library
  - Impact: Dramatically improves test coverage and catches edge cases

### Medium Priority

- **Performance Benchmarks**: Systematic performance measurement and regression detection
  - Track validation performance over time
  - Compare against other validation libraries
  - Prevent performance regressions in CI

- **Custom Validators (Plugin System)**: Extensible system for domain-specific validations
  - Example: credit card validation, business hours validation
  - Implementation: Validator registry with `.addValidator()` static method
  - Impact: Makes library extensible for specific use cases

- **Memoization (Cache Compiled Regex Patterns)**: Cache expensive operations
  - Cache regex compilation for better performance
  - Cache schema compilation for complex objects
  - Implementation: Use Map/WeakMap for caching
  - Impact: Performance improvement for regex-heavy validations
