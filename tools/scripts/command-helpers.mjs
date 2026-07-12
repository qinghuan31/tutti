import { execFileSync, spawn, spawnSync } from "node:child_process";

const windowsCmdCommands = new Set(["corepack", "npm", "npx", "pnpm"]);

export function isWindows() {
  return process.platform === "win32";
}

export function resolveCommand(command) {
  return command;
}

export function spawnCommand(command, args, options) {
  const invocation = resolveInvocation(command, options);
  return spawn(invocation.command, args, invocation.options);
}

export function spawnSyncCommand(command, args, options) {
  const invocation = resolveInvocation(command, options);
  return spawnSync(invocation.command, args, invocation.options);
}

export function execFileSyncCommand(command, args, options) {
  const invocation = resolveInvocation(command, options);
  return execFileSync(invocation.command, args, invocation.options);
}

function resolveInvocation(command, options = {}) {
  if (
    isWindows() &&
    windowsCmdCommands.has(command.toLowerCase()) &&
    !options.shell
  ) {
    return {
      command,
      options: {
        ...options,
        shell: true
      }
    };
  }

  return {
    command: resolveCommand(command),
    options
  };
}
