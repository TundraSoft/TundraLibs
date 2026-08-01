# Security Policy

## Supported Versions

TundraLibs packages are versioned independently and are currently in a
pre-1.0 development phase. Security fixes are applied to the **latest
released version** of each package only.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report vulnerabilities privately via GitHub's private vulnerability
reporting: go to the repository's **Security** tab → **Report a
vulnerability**. This opens a private advisory visible only to the
maintainers.

Please include:

- The affected package(s) (`@tundralibs/...`) and version(s)
- The runtime(s) where it reproduces (Deno / Bun / Node.js)
- A minimal reproduction or proof of concept
- The impact as you assess it

## What to Expect

- Best-effort acknowledgement within **7 days**.
- We will work with you on a fix and coordinate disclosure — please do
  not disclose publicly until a fixed version is released.
- Credit is given in the advisory and changelog unless you prefer
  otherwise.

## Scope

All packages under `packages/` in this repository (the `@tundralibs`
scope on JSR). Vulnerabilities in third-party dependencies should be
reported upstream; if a TundraLibs package pins or misuses a vulnerable
dependency, that is in scope here.
