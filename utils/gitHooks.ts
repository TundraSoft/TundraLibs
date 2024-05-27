const hookTypes = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'pre-receive',
  'update',
  'post-receive',
  'post-update',
  'push-to-checkout',
  'pre-auto-gc',
  'post-rewrite',
  'sendemail-validate',
  'fsmonitor-watchman',
  'p4-changelist',
  'p4-prepare-changelist',
  'p4-post-changelist',
];

export const loadHooks = async (hookPath: string) => {
  // Go through the folder, find all files and copy to .git/hooks folder if they are not already there
  const hooks = await Deno.readDir(hookPath);
  for await (const hook of hooks) {
    if (hook.isFile) {
      const hookName = hook.name;
      if (hookTypes.includes(hookName)) {
        const hookFile = await Deno.readTextFile(`${hookPath}/${hookName}`);
        const gitHookPath = `.git/hooks/${hookName}`;
        // Delete the file if it exists
        try {
          await Deno.remove(gitHookPath);
        } catch {
          // Suppress error
        }
        await Deno.writeTextFile(gitHookPath, hookFile);
        await Deno.chmod(gitHookPath, 0o755);
      }
    }
  }
};

if (import.meta.main) {
  await loadHooks('./.hooks');
}
