# TunrdaLibs Contributing guide

Find a feature which would be usefull? A bug you can fix? Maybe a better or smarter way to do things which leads to better reliability and performance? Fork and branch away and make a PR! We are always excited to see your contribution. 

However, we do have a few "Guidelines", please ensure to follow them so as to keep the usage of the libraries seamless throughout the ecosystem :)

## Directory Structure

```
tundralibs
│   README.md
│   dependencies.ts
|   dev_dependencies.ts
│
└───module1
│   │   types.ts
│   │   module.ts
|   |   mod.ts
|   |   README.md
│   
└───module2
    │   types.ts
    │   module2.ts
```

Above is a representation of the directory structure. The root contains 3 important files:
- README.md - The main readme file. This links to the README file for each module
- dependencies.ts - All dependencies of all libraries present here. Do check if the library is already present here. If it is and the version is different, you can change but run a through testing before raising a PR
- dev_dependencies.ts - The dependencies required for testing and other development activities.

In each module, typically 4 core files are present:
- README.md - A detailed readme file detailing the functionality of the module
- mod.ts - The centralized export file. This is the file which will be referenced for all imports
- Module file - The actual module logic. *Avoid writing the module logic in mod.ts directly*
- Test files - Deno test files for your module.

## Issue Creation

Create a new issue or look for an issue you would like to fix. Please do not start work before this crucial step as it provides not just visibility but also prevents users from working on same issue/feature. 

Few key notes on issues & Branches:
- Ensure your issue explains the problem you intend to solve. If the issue was opened by someone else, then ensure to add comments/details on how the fix is being built or worked on.
- Name your branch appropriately. Avoid using random names like "test123" etc. Rather use the issue name
- Each branch to work on a single issue! Avoid multiple issues in a single branch. This makes reviewing easy and also provides capability to exclude specific changes.
- Always create your branch from main branch! Avoid creation from child branches to write new modules/features. Branching from a branch should only be done to fix issues in that branch before PR. Once branch has been merged branch from main only.

## Coding

We try to restrict the number of "rules" to code, but we do have few suggestions. We strongly recommend sticking to it so as to keep consisteny.

- Variable Name - We follow descriptive camlecased variable naming. As with Typescript, do ensure they are strongly typed and if possible avoid "any" as a type. Additionally, protected variables are to be prefixed by `_` and private variables are to be prefixed with `__`.
  - _variableName: string -- This is a protected variable
  - __variableName: number -- This is a private variable
- Besides doc blocks, do add comments in your code flow to explain what is being done. This helps beginners understand your thought process
- Async First - Promise away when possible!
- Write as many test cases as possible
- fmt & lint - run Deno.fmt and Deno.lint before you check in!
- Do not store sensitive information! Example secret keys or database username/password for testing etc. 

## Merging & CI Pipelines

