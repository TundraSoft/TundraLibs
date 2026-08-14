#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * @fileoverview Workspace manager for the TundraLibs monorepo.
 *
 * Single owner of the package lifecycle and of every generated file
 * that enumerates packages:
 *
 * - `.github/workspace-meta.json`        display/wiki name per package
 * - `.release-please-manifest.json`      current version per package
 * - `release-please-config.json`         release policy per package
 * - `.github/labeler.yml`                `pkg:` PR labels
 * - `.github/codecov.yml`                one Codecov component per package
 * - `.github/ISSUE_TEMPLATE/*.yml`       issue forms (package dropdowns)
 *
 * Root `deno.json` / `package.json` are NEVER touched — their workspace
 * globs pick up new packages automatically.
 *
 * Commands:
 *   deno task workspace:add <Name>       scaffold a package + sync
 *   deno task workspace:remove <name>    delete a package + sync (--force to skip prompt)
 *   deno task workspace:sync             regenerate all generated files
 *   deno task workspace:sync:check       fail if any generated file drifted (CI)
 *
 * Naming rule: the `<Name>` argument as typed becomes the display/wiki
 * name (e.g. `RESTler`, `MetroMan`); its lowercase form is the package
 * dir and the `@tundralibs/<name>` package name.
 *
 * @module
 */

const SCOPE = '@tundralibs';
const PACKAGES_DIR = 'packages';
const META_PATH = '.github/workspace-meta.json';
/**
 * Version a freshly scaffolded package carries until its first release.
 *
 * `0.0.0`, NOT `0.1.0`: this value flows into the package manifests and from
 * there into `.release-please-manifest.json`, which release-please reads as
 * "already released". Seeding `0.1.0` made it treat that version as shipped,
 * so a new package's first `feat:` bumped the minor and its FIRST published
 * release was `0.2.0` — `0.1.0` never existed on JSR (this is exactly what
 * happened to ambient and tracer). From `0.0.0`, the first `feat:` produces
 * `0.1.0` as intended.
 */
const NEW_PACKAGE_VERSION = '0.0.0';

// ---------------------------------------------------------------------
// Workspace state
// ---------------------------------------------------------------------

type Meta = { _comment: string; packages: Record<string, string> };
type Pkg = {
  dir: string;
  version: string;
  displayName: string;
  description: string;
};

const readJson = <T>(path: string): T =>
  JSON.parse(Deno.readTextFileSync(path)) as T;

const readMeta = (): Meta => readJson<Meta>(META_PATH);

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** All packages: every packages/<dir> with a deno.json (name+version). */
const collectPackages = (meta: Meta): Pkg[] => {
  const pkgs: Pkg[] = [];
  for (const entry of [...Deno.readDirSync(PACKAGES_DIR)].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory) continue;
    try {
      const d = readJson<
        { name?: string; version?: string; description?: string }
      >(
        `${PACKAGES_DIR}/${entry.name}/deno.json`,
      );
      if (typeof d.name === 'string' && typeof d.version === 'string') {
        pkgs.push({
          dir: entry.name,
          version: d.version,
          displayName: meta.packages[entry.name] ?? capitalize(entry.name),
          description: d.description ?? '',
        });
      }
    } catch {
      // no deno.json — not a package
    }
  }
  if (pkgs.length === 0) {
    console.error('No packages found under packages/ — refusing to generate.');
    Deno.exit(1);
  }
  return pkgs;
};

// ---------------------------------------------------------------------
// Generated-file renderers (edit policy here, then `workspace:sync`)
// ---------------------------------------------------------------------

const renderMeta = (meta: Meta, pkgs: Pkg[]): string => {
  // Prune deleted packages, add missing ones (default capitalized).
  const packages = Object.fromEntries(
    pkgs.map((p) => [p.dir, meta.packages[p.dir] ?? capitalize(p.dir)]),
  );
  return JSON.stringify({ _comment: meta._comment, packages }, null, 2) + '\n';
};

const renderManifest = (pkgs: Pkg[]): string =>
  JSON.stringify(
    Object.fromEntries(pkgs.map((p) => [`${PACKAGES_DIR}/${p.dir}`, p.version])),
    null,
    2,
  ) + '\n';

const renderReleasePleaseConfig = (pkgs: Pkg[]): string =>
  JSON.stringify(
    {
      '$schema': 'https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json',
      'separate-pull-requests': true,
      'include-component-in-tag': true,
      'changelog-sections': [
        { type: 'feat', section: 'Features' },
        { type: 'fix', section: 'Bug Fixes' },
        { type: 'perf', section: 'Performance' },
        { type: 'refactor', section: 'Refactoring' },
        { type: 'docs', section: 'Documentation' },
        { type: 'chore', section: 'Miscellaneous', hidden: true },
        { type: 'test', section: 'Tests', hidden: true },
        { type: 'ci', section: 'CI', hidden: true },
      ],
      packages: Object.fromEntries(pkgs.map((p) => [`${PACKAGES_DIR}/${p.dir}`, {
        'release-type': 'node',
        'component': p.dir,
        // A breaking (`!`) commit on a 0.x package bumps MINOR, not major —
        // without this, release-please graduates a pre-1.0 package to 1.0.0
        // off any breaking commit. tracer nearly shipped as an accidental
        // 1.0.0 exactly this way (the otlp subpath rename), and pact is
        // deliberately held pre-1.0. Inert once a package reaches 1.0.0.
        'bump-minor-pre-major': true,
        // Prerelease bump strategy only while the package version carries
        // a prerelease suffix (1.0.0-devN -> devN+1). Stable versions use
        // normal semver bumps — self-adapts on graduation to 1.0.0.
        ...(p.version.includes('-') ? { versioning: 'prerelease', prerelease: true } : {}),
        'extra-files': [{ type: 'json', path: 'deno.json', jsonpath: '$.version' }],
      }])),
    },
    null,
    2,
  ) + '\n';

const renderLabeler = (pkgs: Pkg[]): string => {
  const lines = [
    '# GENERATED by .github/scripts/workspace.ts — do not edit.',
    '# Path-based PR labels applied by actions/labeler (pr-labeler.yml).',
    '',
  ];
  for (const p of pkgs) {
    lines.push(
      `'pkg: ${p.dir}':`,
      '  - changed-files:',
      `      - any-glob-to-any-file: ${PACKAGES_DIR}/${p.dir}/**`,
    );
  }
  lines.push(
    `'infra':`,
    '  - changed-files:',
    '      - any-glob-to-any-file:',
    '          - .github/**',
    '          - deno.json',
    '          - package.json',
    '          - release-please-config.json',
    '          - .release-please-manifest.json',
    '',
  );
  return lines.join('\n');
};

/**
 * Codecov config. One `component` per package so a single monorepo LCOV
 * upload is split by path (no per-package flagged uploads needed). Project
 * status is `auto` (coverage may not regress) rather than a hard target, so
 * re-introducing coverage doesn't fail checks on under-covered packages.
 */
const renderCodecov = (pkgs: Pkg[]): string => {
  const lines = [
    '# GENERATED by .github/scripts/workspace.ts — do not edit.',
    '# One component per package; a single LCOV upload is split by path.',
    'ignore:',
    "  - '**/*.test.ts'",
    "  - '**/*.bench.ts'",
    "  - '**/tests/**'",
    "  - '**/fixtures/**'",
    "  - '.github/**'",
    'coverage:',
    '  precision: 2',
    '  round: down',
    "  range: '70...90'",
    '  status:',
    '    project:',
    '      default:',
    '        target: auto',
    '        threshold: 1%',
    '    patch:',
    '      default:',
    '        target: 70%',
    '        threshold: 5%',
    'comment:',
    "  layout: 'reach, diff, components, files, footer'",
    '  behavior: default',
    '  require_changes: false',
    'component_management:',
    '  default_rules:',
    '    statuses:',
    '      - type: project',
    '        target: auto',
    // Same tolerance as the project-level status. Without it a component
    // fails on ANY dip — including refactors that delete covered branches in
    // packages the PR never touched.
    '        threshold: 1%',
    '        branches:',
    "          - '!main'",
    '  individual_components:',
  ];
  for (const p of pkgs) {
    lines.push(
      `    - component_id: ${p.dir}`,
      `      name: ${p.dir}`,
      '      paths:',
      `        - packages/${p.dir}/**`,
      '      statuses:',
      '        - type: project',
      '          target: auto',
      '          threshold: 1%',
    );
  }
  return lines.join('\n') + '\n';
};

const dropdownOptions = (pkgs: Pkg[]): string =>
  pkgs.map((p) => `        - ${p.dir}`).join('\n');

const renderBugReport = (pkgs: Pkg[]): string => `# GENERATED by .github/scripts/workspace.ts — do not edit.
name: Bug Report
description: Something is broken in a TundraLibs package
labels: ['bug']
body:
  - type: dropdown
    id: package
    attributes:
      label: Package
      description: Which package is affected?
      options:
${dropdownOptions(pkgs)}
    validations:
      required: true
  - type: dropdown
    id: runtime
    attributes:
      label: Runtime
      options:
        - Deno
        - Bun
        - Node.js
        - Multiple / all
    validations:
      required: true
  - type: input
    id: runtime-version
    attributes:
      label: Runtime version
      placeholder: e.g. deno 2.9.0
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      description: Minimal code + commands to trigger the bug.
      render: typescript
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behaviour
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behaviour (include errors/output)
    validations:
      required: true
`;

const renderFeatureRequest = (pkgs: Pkg[]): string => `# GENERATED by .github/scripts/workspace.ts — do not edit.
name: Feature Request
description: Propose an enhancement to a TundraLibs package
labels: ['enhancement']
body:
  - type: dropdown
    id: package
    attributes:
      label: Package
      description: Which package should this land in? (pick the closest)
      options:
${dropdownOptions(pkgs)}
        - new package
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: What should it do?
    validations:
      required: true
  - type: textarea
    id: motivation
    attributes:
      label: Why is it needed? (use case)
    validations:
      required: true
`;

const renderIssueConfig = (): string => `# GENERATED by .github/scripts/workspace.ts — do not edit.
blank_issues_enabled: false
`;

const README_START = '<!-- workspace:packages:start -->';
const README_END = '<!-- workspace:packages:end -->';

/**
 * Splices the generated package list into README.md between the marker
 * comments (a bulleted list, not a table — `deno fmt` re-pads tables,
 * which would fight the drift check).
 */
const renderReadme = (pkgs: Pkg[]): string => {
  const current = Deno.readTextFileSync('README.md');
  const start = current.indexOf(README_START);
  const end = current.indexOf(README_END);
  if (start < 0 || end < 0 || end < start) {
    console.error(
      `README.md is missing the ${README_START} / ${README_END} markers.`,
    );
    Deno.exit(1);
  }
  const list = pkgs.map((p) =>
    `- **[${p.displayName}](${PACKAGES_DIR}/${p.dir}/README.md)** — ${p.description}`
  ).join('\n');
  return current.slice(0, start + README_START.length) +
    '\n\n' + list + '\n\n' +
    current.slice(end);
};

// ---------------------------------------------------------------------
// sync — write or check every generated file
// ---------------------------------------------------------------------

const sync = (check: boolean): void => {
  const meta = readMeta();
  const pkgs = collectPackages(meta);

  const outputs: Record<string, string> = {
    [META_PATH]: renderMeta(meta, pkgs),
    '.release-please-manifest.json': renderManifest(pkgs),
    'release-please-config.json': renderReleasePleaseConfig(pkgs),
    '.github/labeler.yml': renderLabeler(pkgs),
    '.github/codecov.yml': renderCodecov(pkgs),
    '.github/ISSUE_TEMPLATE/bug_report.yml': renderBugReport(pkgs),
    '.github/ISSUE_TEMPLATE/feature_request.yml': renderFeatureRequest(pkgs),
    '.github/ISSUE_TEMPLATE/config.yml': renderIssueConfig(),
    'README.md': renderReadme(pkgs),
  };

  let drift = false;
  if (!check) Deno.mkdirSync('.github/ISSUE_TEMPLATE', { recursive: true });
  for (const [path, content] of Object.entries(outputs)) {
    let current = '';
    try {
      current = Deno.readTextFileSync(path);
    } catch {
      // missing counts as drift
    }
    if (current === content) {
      console.log(`  up-to-date  ${path}`);
    } else if (check) {
      drift = true;
      console.error(`  DRIFT       ${path}`);
    } else {
      Deno.writeTextFileSync(path, content);
      console.log(`  wrote       ${path}`);
    }
  }

  if (check && drift) {
    console.error(
      '\nGenerated files are out of date with the packages/ directory.\n' +
        'Run: deno task workspace:sync  (then commit the result)',
    );
    Deno.exit(1);
  }
  console.log(`\n${pkgs.length} packages in sync.`);
};

// ---------------------------------------------------------------------
// add — scaffold a package
// ---------------------------------------------------------------------

const scaffoldDenoJson = (name: string): string =>
  JSON.stringify(
    {
      name: `${SCOPE}/${name}`,
      version: NEW_PACKAGE_VERSION,
      description: `TODO: describe ${SCOPE}/${name}`,
      license: 'MIT',
      exports: { '.': './mod.ts' },
      imports: {},
    },
    null,
    2,
  ) + '\n';

const scaffoldPackageJson = (name: string): string =>
  JSON.stringify(
    {
      name: `${SCOPE}/${name}`,
      version: NEW_PACKAGE_VERSION,
      description: `TODO: describe ${SCOPE}/${name}`,
      license: 'MIT',
      type: 'module',
      main: 'mod.ts',
      exports: { '.': './mod.ts' },
      engines: { node: '>=22' },
      scripts: { test: 'bun test' },
      dependencies: {},
    },
    null,
    2,
  ) + '\n';

const scaffoldModTs = (name: string): string => `/**
 * @fileoverview \`${SCOPE}/${name}\` — TODO: one-line description.
 *
 * @module
 */

export {};
`;

const scaffoldReadme = (name: string, displayName: string): string => `# ${displayName}

TODO: brief description of what this package does and why it exists.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
<!-- Uncomment the environments this package actually supports, after verifying:
     Workers  -- wrangler deploy --dry-run, on a consumer importing this package
     Browsers -- deno bundle --platform=browser -o /dev/null <pkg>/mod.ts
     A package that needs sockets, the filesystem, or a native binding supports neither.
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)
-->

## Installation

**Deno:**

\`\`\`bash
deno add ${SCOPE}/${name}
\`\`\`

**Bun:**

\`\`\`bash
bunx jsr add ${SCOPE}/${name}
\`\`\`

**Node.js:**

\`\`\`bash
npx jsr add ${SCOPE}/${name}
\`\`\`

## Quick Start

\`\`\`typescript
import {} from '${SCOPE}/${name}';

// TODO: usage example
\`\`\`

## License

MIT
`;

const addPackage = (rawName: string): void => {
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(rawName)) {
    console.error(
      `Invalid package name '${rawName}' — letters, digits and hyphens only, starting with a letter.`,
    );
    Deno.exit(1);
  }
  const displayName = rawName;
  const dir = rawName.toLowerCase();
  const path = `${PACKAGES_DIR}/${dir}`;

  try {
    Deno.statSync(path);
    console.error(`Package already exists: ${path}`);
    Deno.exit(1);
  } catch {
    // good — does not exist
  }

  console.log(`Creating ${SCOPE}/${dir} (display name: ${displayName})`);
  Deno.mkdirSync(path, { recursive: true });
  Deno.writeTextFileSync(`${path}/deno.json`, scaffoldDenoJson(dir));
  Deno.writeTextFileSync(`${path}/package.json`, scaffoldPackageJson(dir));
  Deno.writeTextFileSync(`${path}/mod.ts`, scaffoldModTs(dir));
  Deno.writeTextFileSync(`${path}/README.md`, scaffoldReadme(dir, displayName));

  // Record the display name, then regenerate everything.
  const meta = readMeta();
  meta.packages[dir] = displayName;
  Deno.writeTextFileSync(META_PATH, renderMeta(meta, collectPackages(meta)));
  sync(false);

  console.log(`
Done. Follow-ups:
  1. Fill in the description in ${path}/deno.json and ${path}/package.json.
  2. Create the PR label on GitHub:  gh label create 'pkg: ${dir}' -c '#1d76db' -d 'Package: ${dir}'
  3. Commit (the generated config changes are included).`);
};

// ---------------------------------------------------------------------
// remove — delete a package
// ---------------------------------------------------------------------

const removePackage = (rawName: string, force: boolean): void => {
  const dir = rawName.toLowerCase();
  const path = `${PACKAGES_DIR}/${dir}`;
  try {
    Deno.statSync(path);
  } catch {
    console.error(`Package does not exist: ${path}`);
    Deno.exit(1);
  }

  if (!force && !confirm(`Delete ${path} and all its contents?`)) {
    console.log('Aborted.');
    Deno.exit(0);
  }

  Deno.removeSync(path, { recursive: true });
  console.log(`Removed ${path}`);

  const meta = readMeta();
  delete meta.packages[dir];
  Deno.writeTextFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n');
  sync(false);

  console.log(`
Done. Follow-ups:
  1. Delete the PR label on GitHub:  gh label delete 'pkg: ${dir}'
  2. Commit (the generated config changes are included).`);
};

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------

const [command, name] = Deno.args.filter((a) => !a.startsWith('--'));
const force = Deno.args.includes('--force');
const check = Deno.args.includes('--check');

switch (command) {
  case 'add':
    if (!name) {
      console.error('Usage: workspace.ts add <Name>');
      Deno.exit(1);
    }
    addPackage(name);
    break;
  case 'remove':
    if (!name) {
      console.error('Usage: workspace.ts remove <name> [--force]');
      Deno.exit(1);
    }
    removePackage(name, force);
    break;
  case 'sync':
    sync(check);
    break;
  default:
    console.error(`Usage:
  workspace.ts add <Name>        Scaffold a package (Name's casing = display/wiki name)
  workspace.ts remove <name>     Delete a package (--force skips the prompt)
  workspace.ts sync [--check]    Regenerate (or verify) all generated config files`);
    Deno.exit(command ? 1 : 0);
}
