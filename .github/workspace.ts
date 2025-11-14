import * as fs from 'jsr:@std/fs@^1.0.0';
import * as path from 'jsr:@std/path@^1.0.0';
import * as yaml from 'jsr:@std/yaml@^1.0.5';
import { parseArgs } from 'jsr:@std/cli@^1.0.14';

type DenoSchema = {
  name?: string;
  version?: string;
  description?: string;
  exports?: Record<string, string>;
  imports?: Record<string, string>;
  workspace?: string[];
};

type PRTitleSchema = {
  jobs: {
    main: {
      steps: Array<{
        with: {
          scopes: string;
        };
      }>;
    };
  };
};

type EdgeReleaseSchema = {
  on: {
    pull_request: {
      types: string[];
      branches: string[];
      paths: string[];
    };
  };
  [key: string]: unknown;
};

type PublishSchema = {
  on: {
    workflow_dispatch: {
      inputs: {
        workspace: {
          type: string;
          options: string[];
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
    };
  };
  [key: string]: unknown;
};

type IssueTemplateSchema = {
  name: string;
  description: string;
  title: string;
  labels: string[];
  body: Array<{
    type: string;
    id?: string;
    attributes: {
      label?: string;
      description?: string;
      multiple?: boolean;
      options?: string[];
      [key: string]: unknown;
    };
    validations?: Record<string, unknown>;
  }>;
};

const LABELER_YML = '.github/labeler.yml';
const PR_TITLE_YML = '.github/workflows/pr-title.yaml';
const EDGE_RELEASE_YML = '.github/workflows/edge-release.yaml';
const PUBLISH_YML = '.github/workflows/publish.yaml';
const RELEASE_YML = '.github/workflows/release.yaml';
const TEST_YML = '.github/workflows/test.yaml';
const BENCHMARK_YML = '.github/workflows/benchmark.yaml';
const SECURITY_YML = '.github/workflows/security.yaml';
const ISSUE_BUG_YML = '.github/ISSUE_TEMPLATE/issue.bug.yml';
const ISSUE_FEATURE_YML = '.github/ISSUE_TEMPLATE/issue.feature.yml';
const ISSUE_DOCUMENTATION_YML = '.github/ISSUE_TEMPLATE/issue.documentation.yml';
const ISSUE_PERFORMANCE_YML = '.github/ISSUE_TEMPLATE/issue.performance.yml';
const CODECOV_YML = './codecov.yml';
const WORKSPACE_NAME_PATTERN = new RegExp(/^@[a-z0-9-]+\/[a-z0-9-]+$/);
const WORKSPACE_SCOPE = 'tundralibs';

const makeWorkspaceDeno = (
  name: string,
  description: string,
  version: string = '0.1.0',
): DenoSchema => {
  return {
    name: name,
    version: version,
    description: description.trim(),
    exports: {
      '.': './mod.ts',
    },
    imports: {},
  };
};

const getWorkspaces = async (root: string = './'): Promise<string[]> => {
  const denoJSONPath = path.join(root, 'deno.json');
  if (await fs.exists(denoJSONPath)) {
    const denoJSON = JSON.parse(
      await Deno.readTextFile(denoJSONPath),
    ) as DenoSchema;
    if (
      denoJSON.workspace && Array.isArray(denoJSON.workspace) &&
      denoJSON.workspace.length > 0
    ) {
      return denoJSON.workspace
        .map((workspace) => path.parse(workspace).name)
        .filter((workspace) => workspace && workspace.length > 0)
        .sort();
    }
    return [];
  } else {
    throw new Error(`deno.json not found in ${root}`);
  }
};

const checkWorkspaces = async (
  workspaces: Array<string>,
  root: string = './',
): Promise<void> => {
  for (const workspace of workspaces) {
    const workspacePath = path.join(root, workspace);
    if (!(await fs.exists(workspacePath))) {
      throw new Error(`Workspace not found: ${workspacePath}`);
    }
  }
};

/**
 * Updates the codecov.yml file to include or exclude workspaces
 * @param workspaces - Array of workspace names to include
 * @param deleteList - Optional array of workspace names to remove
 */
const updateCodecov = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(CODECOV_YML)) {
    const codecovContent = yaml.parse(
      await Deno.readTextFile(CODECOV_YML),
    ) as Record<string, unknown>;
    
    // Get the component management section
    const componentManagement = codecovContent.component_management as Record<string, unknown>;
    if (!componentManagement) {
      console.warn('No component_management section found in codecov.yml');
      return;
    }
    
    // Get the individual components array
    let individualComponents = (componentManagement.individual_components || []) as Array<Record<string, unknown>>;
    
    // Remove components in the delete list
    if (deleteList && deleteList.length > 0) {
      individualComponents = individualComponents.filter(
        (component) => !deleteList.includes(component.component_id as string)
      );
      
      // Also remove from flags section
      const flags = codecovContent.flags as Record<string, unknown> || {};
      for (const name of deleteList) {
        delete flags[name];
      }
      codecovContent.flags = flags;
    }
    
    // Add components from workspaces that don't exist yet
    for (const name of workspaces) {
      // Skip if component already exists
      if (individualComponents.some(component => component.component_id === name)) {
        continue;
      }
      
      // Add component
      individualComponents.push({
        component_id: name,
        name: name,
        paths: [
          `${name}/**.ts`,
          `!${name}/**.test.ts`
        ],
        statuses: [
          {
            type: "project",
            target: "75%"
          }
        ]
      });
      
      // Add to flags section
      const flags = codecovContent.flags as Record<string, unknown> || {};
      flags[name] = {
        paths: [`${name}/`],
        carryforward: true
      };
      codecovContent.flags = flags;
    }
    
    // Update the component management section
    componentManagement.individual_components = individualComponents;
    codecovContent.component_management = componentManagement;
    
    // Write the updated content back to file
    await Deno.writeTextFile(CODECOV_YML, yaml.stringify(codecovContent));
  } else {
    console.warn(`Codecov config not found at ${CODECOV_YML}`);
  }
};

const updateWorkflows = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  workspaces = workspaces.filter((workspace) =>
    workspace && workspace.length > 0
  );
  await checkWorkspaces(workspaces);
  workspaces = workspaces.sort();
  
  // Update codecov.yml
  await updateCodecov(workspaces, deleteList);
  
  // Ok great, we now sync with git
  if (await fs.exists(LABELER_YML)) {
    const labelerContent = yaml.parse(
      await Deno.readTextFile(LABELER_YML),
    ) as Record<string, unknown>;
    // Remove all workspaces
    Object.entries(labelerContent).forEach(([key, _value]) => {
      if (
        workspaces.includes(key) || (deleteList && deleteList.includes(key))
      ) {
        delete labelerContent[key];
      }
    });
    // Add them back
    for (const name of workspaces) {
      labelerContent[name] = [{
        'changed-files': [
          { 'any-glob-to-any-file': `${name}/*` },
        ],
      }];
    }
    
    // Use proper YAML stringification options to preserve formatting
    const yamlOptions = {
      indent: 2,
      noArrayIndent: false,
      skipInvalid: false,
      flowLevel: -1,
      sortKeys: false,
      lineWidth: 80,
      noRefs: false,
      noCompatMode: false,
      condenseFlow: false,
      quotingType: '"',
      forceQuotes: false,
    };
    
    await Deno.writeTextFile(LABELER_YML, yaml.stringify(labelerContent, yamlOptions));
  }

  if (await fs.exists(PR_TITLE_YML)) {
    // Read the original file content as text to preserve formatting
    const originalContent = await Deno.readTextFile(PR_TITLE_YML);
    
    // Parse to get the current scopes
    const prtitleContent = yaml.parse(originalContent) as PRTitleSchema;
    const currentScopes: string[] = prtitleContent.jobs.main.steps[0]!.with.scopes
      .split('\n').map((s: string) => s.trim()).filter((scope: string) =>
        scope && scope.length > 0 && workspaces.includes(scope) === false
      ).filter((scope: string) => !deleteList?.includes(scope));
    
    // Create the new scopes list
    const newScopes = [...currentScopes, ...workspaces].sort();
    const scopesString = newScopes.join('\n            ');
    
    // Use regex to replace only the scopes section, preserving YAML formatting
    const updatedContent = originalContent.replace(
      /(scopes:\s*\|\-?\s*\n)([\s\S]*?)(\n\s*requireScope:)/,
      `$1            ${scopesString}$3`
    );
    
    await Deno.writeTextFile(PR_TITLE_YML, updatedContent);
  }

  // Update edge-release workflow paths
  await updateEdgeReleaseWorkflow(workspaces, deleteList);
  
  // Update publish workflow options
  await updatePublishWorkflow(workspaces, deleteList);

  // Update release workflow paths
  await updateReleaseWorkflow(workspaces, deleteList);
  
  // Update test workflow paths  
  await updateTestWorkflow(workspaces, deleteList);
  
  // Update benchmark workflow paths
  await updateBenchmarkWorkflow(workspaces, deleteList);
  
  // Update security workflow paths
  await updateSecurityWorkflow(workspaces, deleteList);

  // Update issue templates
  await updateIssueTemplates(workspaces, deleteList);
};

/**
 * Updates all issue templates with workspace package options
 * @param workspaces - Array of workspace names 
 * @param deleteList - Optional array of workspace names to remove
 * 
 * This function updates all issue templates to include the current workspaces
 * in JSR package format (@tundralibs/workspace-name). It handles:
 * - Bug reports: Includes workflow/infrastructure and multiple package options
 * - Feature requests: Includes new package and tooling options
 * - Documentation: Includes repository-wide options
 * - Performance: Focuses on package-specific issues
 */
const updateIssueTemplates = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  // Convert workspace names to JSR package format
  const jsrPackages = workspaces.map(name => `@${WORKSPACE_SCOPE}/${name}`);
  
  // Define the issue template files to update
  const issueTemplates = [
    {
      file: ISSUE_BUG_YML,
      packageOptions: [
        'Workflow/Infrastructure',
        ...jsrPackages.sort(),
      ]
    },
    {
      file: ISSUE_FEATURE_YML,
      packageOptions: [
        ...jsrPackages.sort(),
        'New package',
        'Infrastructure/Tooling'
      ]
    },
    {
      file: ISSUE_DOCUMENTATION_YML,
      packageOptions: [
        ...jsrPackages.sort(),
        'Repository/General',
        'All packages'
      ]
    },
    {
      file: ISSUE_PERFORMANCE_YML,
      packageOptions: [
        ...jsrPackages.sort(),
        'Multiple packages'
      ]
    }
  ];

  // Update each issue template
  for (const template of issueTemplates) {
    if (await fs.exists(template.file)) {
      try {
        const issueContent = yaml.parse(
          await Deno.readTextFile(template.file),
        ) as IssueTemplateSchema;
        
        // Find the dropdown for package selection
        const packageDropdown = issueContent.body.find(
          item => item.type === 'dropdown' && item.id === 'package'
        );
        
        if (packageDropdown) {
          // Update options with the JSR package format
          packageDropdown.attributes.options = template.packageOptions;
          
          // Use proper YAML stringification options to preserve formatting
          const yamlOptions = {
            indent: 2,
            noArrayIndent: true,
            skipInvalid: false,
            flowLevel: -1,
            sortKeys: false,
            lineWidth: 80,
            noRefs: false,
            noCompatMode: false,
            condenseFlow: false,
            quotingType: '"',
            forceQuotes: false,
          };
          
          // Write the updated content back to the file
          await Deno.writeTextFile(template.file, yaml.stringify(issueContent, yamlOptions));
          console.log(`Updated package options in ${template.file}`);
        } else {
          console.warn(`No package dropdown found in ${template.file}`);
        }
      } catch (error) {
        console.warn(`Failed to update ${template.file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.warn(`Issue template not found: ${template.file}`);
    }
  }
};

/**
 * Updates the edge-release workflow paths trigger with current workspaces
 * @param workspaces - Array of workspace names
 * @param deleteList - Optional array of workspace names to remove
 */
const updateEdgeReleaseWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(EDGE_RELEASE_YML)) {
    // Read original content to preserve formatting
    const originalContent = await Deno.readTextFile(EDGE_RELEASE_YML);
    
    // Create the new paths array
    const paths = workspaces.map(workspace => `${workspace}/**`);
    const pathsString = paths.map(path => `      - ${path}`).join('\n');
    
    // Use regex to replace only the paths section, preserving YAML formatting
    const updatedContent = originalContent.replace(
      /(paths:\s*\n)([\s\S]*?)(\n\s*jobs:)/,
      `$1${pathsString}$3`
    );
    
    await Deno.writeTextFile(EDGE_RELEASE_YML, updatedContent);
  } else {
    console.warn(`Edge release workflow not found at ${EDGE_RELEASE_YML}`);
  }
};

/**
 * Updates the publish workflow workspace options with current workspaces
 * @param workspaces - Array of workspace names
 * @param deleteList - Optional array of workspace names to remove
 */
const updatePublishWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(PUBLISH_YML)) {
    // Read original content to preserve formatting
    const originalContent = await Deno.readTextFile(PUBLISH_YML);
    
    // Create the new options array (include 'all' option)
    const workspaceOptions = ['all', ...workspaces.sort()];
    const optionsString = workspaceOptions.map(option => `          - ${option}`).join('\n');
    
    // Use regex to replace only the options section, preserving YAML formatting
    const updatedContent = originalContent.replace(
      /(options:\s*\n)([\s\S]*?)(\n\s*reason:)/,
      `$1${optionsString}$3`
    );
    
    await Deno.writeTextFile(PUBLISH_YML, updatedContent);
  } else {
    console.warn(`Publish workflow not found at ${PUBLISH_YML}`);
  }
};

/**
 * Updates the release workflow paths trigger with current workspaces
 * @param workspaces - Array of workspace names
 * @param deleteList - Optional array of workspace names to remove
 */
const updateReleaseWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(RELEASE_YML)) {
    // Read original content to preserve formatting
    const originalContent = await Deno.readTextFile(RELEASE_YML);
    
    // Create the new paths array for both pull_request and push triggers
    const paths = workspaces.map(workspace => `${workspace}/**`);
    const pathsString = paths.map(path => `      - ${path}`).join('\n');
    
    // Update both pull_request and push trigger paths
    let updatedContent = originalContent.replace(
      /(pull_request:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*push:)/,
      `$1${pathsString}$3`
    );
    
    updatedContent = updatedContent.replace(
      /(push:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*jobs:)/,
      `$1${pathsString}$3`
    );
    
    await Deno.writeTextFile(RELEASE_YML, updatedContent);
  } else {
    console.warn(`Release workflow not found at ${RELEASE_YML}`);
  }
};

/**
 * Updates the test workflow paths trigger with current workspaces
 * @param workspaces - Array of workspace names
 * @param deleteList - Optional array of workspace names to remove
 */
const updateTestWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(TEST_YML)) {
    // Read original content to preserve formatting
    const originalContent = await Deno.readTextFile(TEST_YML);
    
    // Create the new paths array
    const paths = workspaces.map(workspace => `${workspace}/**`);
    const pathsString = paths.map(path => `      - ${path}`).join('\n');
    
    // Update both pull_request and push trigger paths
    let updatedContent = originalContent.replace(
      /(pull_request:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*push:)/,
      `$1${pathsString}$3`
    );
    
    updatedContent = updatedContent.replace(
      /(push:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*jobs:)/,
      `$1${pathsString}$3`
    );
    
    await Deno.writeTextFile(TEST_YML, updatedContent);
  } else {
    console.warn(`Test workflow not found at ${TEST_YML}`);
  }
};

/**
 * Updates the benchmark workflow paths trigger with current workspaces
 * @param workspaces - Array of workspace names
 * @param deleteList - Optional array of workspace names to remove
 */
const updateBenchmarkWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(BENCHMARK_YML)) {
    // Read original content to preserve formatting
    const originalContent = await Deno.readTextFile(BENCHMARK_YML);
    
    // Create the new paths array
    const paths = workspaces.map(workspace => `${workspace}/**`);
    const pathsString = paths.map(path => `      - ${path}`).join('\n');
    
    // Update both pull_request and push trigger paths
    let updatedContent = originalContent.replace(
      /(pull_request:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*push:)/,
      `$1${pathsString}$3`
    );
    
    updatedContent = updatedContent.replace(
      /(push:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*jobs:)/,
      `$1${pathsString}$3`
    );
    
    await Deno.writeTextFile(BENCHMARK_YML, updatedContent);
  } else {
    console.warn(`Benchmark workflow not found at ${BENCHMARK_YML}`);
  }
};

/**
 * Updates the security workflow paths trigger with current workspaces
 * @param workspaces - Array of workspace names
 * @param deleteList - Optional array of workspace names to remove
 */
const updateSecurityWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (await fs.exists(SECURITY_YML)) {
    // Read original content to preserve formatting
    const originalContent = await Deno.readTextFile(SECURITY_YML);
    
    // Create the new paths array
    const paths = workspaces.map(workspace => `${workspace}/**`);
    const pathsString = paths.map(path => `      - ${path}`).join('\n');
    
    // Update both pull_request and push trigger paths if they exist
    let updatedContent = originalContent;
    if (updatedContent.includes('pull_request:')) {
      updatedContent = updatedContent.replace(
        /(pull_request:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*push:)/,
        `$1${pathsString}$3`
      );
    }
    
    if (updatedContent.includes('push:')) {
      updatedContent = updatedContent.replace(
        /(push:\s*[\s\S]*?paths:\s*\n)([\s\S]*?)(\n\s*jobs:)/,
        `$1${pathsString}$3`
      );
    }
    
    await Deno.writeTextFile(SECURITY_YML, updatedContent);
  } else {
    console.warn(`Security workflow not found at ${SECURITY_YML}`);
  }
};

/**
 * Adds a new workspace to the project
 * @param name - The name of the workspace to add
 * @param scope - The scope for the workspace (defaults to WORKSPACE_SCOPE)
 * @throws Error if workspace name is invalid or already exists
 */
const addWorkspace = async (name: string, scope: string = WORKSPACE_SCOPE) => {
  // Construct the full workspace name with scope
  const workspaceName = `@${scope}/${name}`;

  // Validate workspace name
  if (WORKSPACE_NAME_PATTERN.test(workspaceName) === false) {
    throw new Error(
      `Invalid workspace name: ${name} (scoped - ${workspaceName})`,
    );
  }

  // Check if workspace already exists
  const workspaces = await getWorkspaces();
  if (workspaces.includes(name)) {
    throw new Error(`Workspace already exists: ${name}`);
  }

  // Create workspace directory
  const workspacePath = path.join('./', name);
  await fs.ensureDir(workspacePath);

  // Create workspace files
  await Deno.writeFile(
    path.join(workspacePath, 'deno.json'),
    new TextEncoder().encode(
      JSON.stringify(
        makeWorkspaceDeno(workspaceName, 'TODO: Add description'),
        null,
        2,
      ),
    ),
  );
  await Deno.writeFile(
    path.join(workspacePath, 'mod.ts'),
    new TextEncoder().encode(''),
  );

  // Update root deno.json to include new workspace
  workspaces.push(name);
  const denoJSONPath = path.join('./', 'deno.json');
  const denoJSON = JSON.parse(
    await Deno.readTextFile(denoJSONPath),
  ) as DenoSchema;
  denoJSON.workspace = workspaces.sort().map((workspace) => `./${workspace}`);
  await Deno.writeTextFile(denoJSONPath, JSON.stringify(denoJSON, null, 2));

  // Update workflows to include new workspace
  await updateWorkflows(workspaces);
};

/**
 * Removes a workspace from the project
 * @param name - The name of the workspace to remove
 * @throws Error if workspace name is invalid or doesn't exist
 */
const removeWorkspace = async (name: string) => {
  // Construct the full workspace name with scope
  const workspaceName = `@${WORKSPACE_SCOPE}/${name}`;

  // Validate workspace name
  if (WORKSPACE_NAME_PATTERN.test(workspaceName) === false) {
    console.error(
      `Invalid workspace name: ${name} (scoped - ${workspaceName})`,
    );
    Deno.exit(1);
  }

  // Check if workspace exists
  const workspaces = await getWorkspaces();
  if (!workspaces.includes(name)) {
    console.error(`Workspace ${name} doesn't exist.`);
    Deno.exit(1);
  }

  // Update root deno.json to remove workspace
  const updatedWorkspaces = workspaces.filter((workspace) =>
    workspace !== name
  );
  const denoJSONPath = path.join('./', 'deno.json');
  const denoJSON = JSON.parse(
    await Deno.readTextFile(denoJSONPath),
  ) as DenoSchema;
  denoJSON.workspace = updatedWorkspaces.sort().map((workspace) =>
    `./${workspace}`
  );
  await Deno.writeTextFile(denoJSONPath, JSON.stringify(denoJSON, null, 2));

  // Update workflows to remove workspace
  await updateWorkflows(updatedWorkspaces, [name]);

  console.log(`Workspace ${name} removed from project configuration.`);
  console.warn(
    `Note: You may want to manually delete the ${name} directory if it's no longer needed.`,
  );
};

if (import.meta.main) {
  const args = parseArgs(Deno.args);
  switch (args._[0]) {
    case 'add': {
      const name = args._[1] as string;
      if (!name) {
        console.log('Usage: workspace.ts add <workspace-name>');
        break;
      }
      await addWorkspace(name);
      break;
    }
    case 'remove': {
      const name = args._[1] as string;
      if (!name) {
        console.log('Usage: workspace.ts remove <workspace-name>');
        break;
      }
      await removeWorkspace(name);
      break;
    }
    case 'sync':
      await updateWorkflows(await getWorkspaces());
      break;
    default:
      console.log('Usage: workspace.ts <add|remove> <workspace-name>');
      break;
  }
}
