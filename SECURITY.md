# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of TundraLibs seriously. If you believe you have found a security vulnerability in any of our packages, please report it to us as described below.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please use:

**GitHub Security Advisories**

- Go to the [Security tab](https://github.com/TundraSoft/TundraLibs/security/advisories/new)
- Click "Report a vulnerability"
- Fill out the form with details

### What to Include

Please include the following information in your report:

- **Package name and version** affected (e.g., `@tundralibs/utils@1.2.3`)
- **Type of vulnerability** (e.g., injection, XSS, authentication bypass)
- **Description** of the vulnerability and its potential impact
- **Steps to reproduce** the vulnerability
- **Proof of concept** code or screenshots (if applicable)
- **Possible fix** or mitigation (if you have suggestions)

### Security Scanning

This repository uses automated security scanning tools:

- **Trivy**: Scans for vulnerabilities in dependencies and code
- **GitHub Security Features**: Dependabot, Code scanning, Secret scanning
- **SonarQube**: Additional code quality and security analysis

Security scans run:

- On every pull request
- Daily on the main branch
- On-demand via workflow dispatch

### Security Best Practices

When contributing to TundraLibs:

1. **Dependencies**: Keep dependencies up to date
2. **Secrets**: Never commit secrets, API keys, or sensitive data
3. **Input validation**: Always validate and sanitize inputs
4. **Error handling**: Don't expose sensitive information in error messages
5. **Permissions**: Follow the principle of least privilege

### Vulnerability Disclosure Process

1. **Receipt**: We acknowledge receipt of your vulnerability report
2. **Assessment**: We assess the vulnerability and determine severity
3. **Development**: We develop and test a fix
4. **Coordination**: We coordinate the release with you (if desired)
5. **Release**: We release the fix and publish a security advisory
6. **Recognition**: We acknowledge your contribution (unless you prefer anonymity)

### Security Advisories

Published security advisories can be found at:
https://github.com/TundraSoft/TundraLibs/security/advisories

### Contact

For any questions about this security policy, please create an issue or contact the maintainers.

---

Thank you for helping keep TundraLibs and our users safe!
