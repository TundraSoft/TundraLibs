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
const ISSUE_YML = '.github/ISSUE_TEMPLATE/issue.bug.yml';
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
    await Deno.writeTextFile(LABELER_YML, yaml.stringify(labelerContent));
  }

  if (await fs.exists(PR_TITLE_YML)) {
    const prtitleContent = yaml.parse(
      await Deno.readTextFile(PR_TITLE_YML),
    ) as PRTitleSchema;
    const scopes: string[] = prtitleContent.jobs.main.steps[0]!.with.scopes
      .split('\n').map((s: string) => s.trim()).filter((scope: string) =>
        scope && scope.length > 0 && workspaces.includes(scope) === false
      ).filter((scope: string) => !deleteList?.includes(scope));
    if (workspaces.length === 0) {
      scopes.push('');
    }
    // Add them back
    prtitleContent.jobs.main.steps[0]!.with.scopes = [...scopes, ...workspaces]
      .join('\n');
    await Deno.writeTextFile(PR_TITLE_YML, yaml.stringify(prtitleContent));
  }

  if (await fs.exists(ISSUE_YML)) {
    const issueContent = yaml.parse(
      await Deno.readTextFile(ISSUE_YML),
    ) as IssueTemplateSchema;
    
    // Find the dropdown for package selection
    const packageDropdown = issueContent.body.find(
      item => item.type === 'dropdown' && item.id === 'package'
    );
    
    if (packageDropdown) {
      // Reset options to include common packages and all workspaces
      packageDropdown.attributes.options = [
        'Workflow',
        ...workspaces.sort()
      ];
      
      // Write the updated content back to the file
      await Deno.writeTextFile(ISSUE_YML, yaml.stringify(issueContent));
    }
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
