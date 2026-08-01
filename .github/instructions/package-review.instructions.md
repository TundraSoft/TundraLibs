# Package Review Instructions

These instructions guide comprehensive package reviews to identify security, performance, usability, and documentation issues.

## Review Scope

When reviewing a package, analyze:

1. **Security Issues** - Critical vulnerabilities and risks
2. **Performance Issues** - Inefficiencies and optimization opportunities
3. **Usability Issues** - API design, error handling, missing features
4. **Documentation Gaps** - Missing or incomplete documentation

## Review Document Structure

Create a `REVIEW.md` file in the package root with the following structure:

### Header Section

```markdown
# [Package Name] Package Review - Action Items

**Review Date:** [Current Date]
**Scope:** [What was reviewed]
**Last Updated:** [Current Date]

---
```

### Progress Tracking Section

```markdown
## 🎉 **Recent Progress ([Date])**

### ✅ **[X] [Category] Issues FIXED!**

1. **[Issue Name]** - [Brief description of fix]
2. ...

### ⚡ **[X] [Category] Improvements!**

1. **[Improvement Name]** - [Brief description]
2. ...

### 🎊 **[Category]: [X]% Complete!**

[Summary of completion status]

### 📊 **Progress Summary**

- **Security:** [X]/[Y] completed ([Z]%) [Status Emoji]
- **Performance:** [X]/[Y] completed ([Z]%) [Status Emoji]
- **Usability:** [X]/[Y] completed ([Z]%) [Status Emoji]
- **Documentation:** [X]/[Y] completed ([Z]%) [Status Emoji]
- **Medium Priority:** [X]/[Y] completed ([Z]%) [Status Emoji]

**Overall Progress:** [X]/[Y] items completed ([Z]%)

---
```

Status emojis:
- ✅ (100%) - Complete
- 🟢 (80-99%) - Nearly complete
- 🟡 (40-79%) - In progress
- 🔴 (0-39%) - Not started

### Action Item Checklist

```markdown
## 📋 Action Item Checklist

### 🔒 Security (High Priority)

- [ ] [Item description]
- [x] ✅ [Completed item]

### ⚡ Performance (High Priority)

- [ ] [Item description]

### 🎯 Usability (High Priority)

- [ ] [Item description]

### 📚 Documentation

- [ ] [Item description]

### 🔧 Medium Priority Features

- [ ] [Item description]

---
```

### Detailed Analysis Sections

For each category, provide detailed analysis:

```markdown
## 🔒 Security Issues - Detailed Analysis

### Critical

#### [N]. [Issue Title]

**File:** `[filename]` lines [X-Y]

**Issue:** [Detailed description of the security vulnerability]

**Current Code:**

```typescript
// Include relevant code snippet
```

**Risk Level:** [High/Medium/Low] - [Brief risk description]

**Recommended Fix:**

```typescript
// Include proposed fix with comments
```

**Impact:** [Description of what could happen if exploited]

---
```

## Analysis Categories

### 🔒 Security Issues

Look for:
- **Input validation** - Path traversal, injection, malformed input
- **Data exposure** - Sensitive data leaks, environment variables
- **Race conditions** - TOCTOU vulnerabilities, concurrent access
- **Authentication/Authorization** - Permission bypasses
- **Resource exhaustion** - DoS vulnerabilities (memory, file handles)
- **Cryptographic issues** - Weak algorithms, improper key handling

Risk Levels:
- **Critical** - Immediate exploit possible, high impact
- **High** - Exploit likely, significant impact
- **Medium** - Exploit possible with specific conditions
- **Low** - Minimal security impact

### ⚡ Performance Issues

Look for:
- **Inefficient algorithms** - O(n²) where O(n) possible
- **Memory usage** - Large allocations, memory leaks, no streaming
- **Repeated operations** - Redundant validation, duplicate work
- **Missing caching** - Repeated expensive operations
- **Blocking operations** - Synchronous I/O, no parallelization
- **Resource management** - File handles, connections not closed

Impact Levels:
- **High** - Significant slowdown (>50%), memory issues
- **Medium** - Noticeable impact (10-50%), resource waste
- **Low** - Minor optimization (<10%)

### 🎯 Usability Issues

Look for:
- **API inconsistency** - Different patterns for similar operations
- **Error handling** - Unclear errors, inconsistent throw/return behavior
- **Missing features** - Common use cases not supported
- **Poor ergonomics** - Verbose APIs, difficult to use correctly
- **Type safety** - Runtime vs compile-time guarantees
- **Async/sync variants** - Missing one or the other

Priority Levels:
- **High** - Blocks common use cases, difficult to use correctly
- **Medium** - Quality of life improvements, nice to have
- **Low** - Edge cases, advanced features

### 📚 Documentation Gaps

Look for:
- **Missing JSDoc** - Functions without documentation
- **Incomplete JSDoc** - Missing @param, @returns, @throws, @example
- **No package README** - Installation, usage examples missing
- **Missing examples** - Complex features undocumented
- **No migration guide** - Upgrading from other libraries
- **Missing version tags** - No @since, @deprecated tags

## Code Examples

When providing code examples:

1. **Show current problematic code** first
2. **Explain the issue** clearly
3. **Provide recommended fix** with comments
4. **Include usage examples** for the fix
5. **Mention alternative approaches** when applicable

Format:

```markdown
**Current Code:**

```typescript
// Problematic implementation
const example = () => {
  // Bad pattern
};
```

**Recommended Fix:**

```typescript
/**
 * Improved implementation with JSDoc.
 *
 * @param input - Description
 * @returns Description
 * @throws {ErrorType} When condition occurs
 */
const example = (input: string): ReturnType => {
  // Good pattern with validation
  validateInput(input);
  // Rest of implementation
};
```

**Usage:**

```typescript
try {
  const result = example('valid-input');
} catch (error) {
  // Handle error
}
```
```

## Metrics and Estimation

At the end of the review, include:

```markdown
## 📊 Metrics

- **Total Issues Identified:** [N]
- **Security Issues:** [N] ([X] critical, [Y] high, [Z] medium)
- **Performance Issues:** [N] ([X] high, [Y] medium, [Z] low)
- **Usability Issues:** [N] ([X] high, [Y] medium, [Z] low)
- **Documentation Gaps:** [N]

**Estimated Effort:** [X-Y] weeks for complete implementation

---
```

## Implementation Phases

Organize fixes into phases:

```markdown
## 🎯 Implementation Priority

### Phase 1: Security & Critical Fixes ([Timeframe])

1. [Security issue]
2. [Critical bug]

### Phase 2: Performance & Core Features ([Timeframe])

1. [Performance issue]
2. [Missing feature]

### Phase 3: Enhanced Usability ([Timeframe])

1. [API improvement]
2. [Feature addition]

### Phase 4: Documentation & Polish ([Timeframe])

1. [Documentation]
2. [Examples]

---
```

## What's Done Well

Always include a section highlighting good aspects:

```markdown
## ✅ What's Already Done Well

1. ✨ **[Aspect]** - [Why it's good]
2. ✨ **[Aspect]** - [Why it's good]

---
```

## Review Process

1. **Read all code** in the package thoroughly
2. **Identify issues** in each category
3. **Prioritize** by severity and impact
4. **Provide fixes** with code examples
5. **Estimate effort** realistically
6. **Track progress** as issues are resolved
7. **Update regularly** as work progresses

## Tone and Style

- Be **constructive** and **helpful**
- Provide **actionable** recommendations
- Include **code examples** for clarity
- Explain **why** something is an issue
- Acknowledge **good practices** found
- Use clear **section headings** and **emojis** for navigation
- Keep technical **accuracy** high
- Balance **thoroughness** with **readability**

## Regular Updates

When updating the review:

1. Move completed items to "Recent Progress"
2. Update checkboxes in action items
3. Recalculate progress percentages
4. Update "Last Updated" date
5. Add new issues discovered
6. Remove or adjust items as needed
