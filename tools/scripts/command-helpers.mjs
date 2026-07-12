import { execFileSync, spawn, spawnSync } from "node:child_process";

const windowsCmdCommands = new Set(["corepack", "npm", "npx", "pnpm"]);

export function isWindows() {
  return process.platform === "win32";
}

export function resolveCommand(command) {
  return command;
}

export function spawnCommand(command, args, options) {
  const invocation = resolveInvocation(command, args, options);
  return spawn(invocation.command, invocation.args, invocation.options);
}

export function spawnSyncCommand(command, args, options) {
  const invocation = resolveInvocation(command, args, options);
  return spawnSync(invocation.command, invocation.args, invocation.options);
}

export function execFileSyncCommand(command, args, options) {
  const invocation = resolveInvocation(command, args, options);
  return execFileSync(invocation.command, invocation.args, invocation.options);
}

function resolveInvocation(command, args, options = {}) {
  if (
    isWindows() &&
    windowsCmdCommands.has(normalizeCommandName(command)) &&
    !options.shell
  ) {
    return {
      args: ["/d", "/s", "/c", formatWindowsCommand(command, args)],
      command: process.env.ComSpec ?? "cmd.exe",
      options
    };
  }

  return {
    args,
    command: resolveCommand(command),
    options
  };
}

function normalizeCommandName(command) {
  return command
    .replace(/^.*[\\/]/u, "")
    .replace(/\.(?:bat|cmd)$/iu, "")
    .toLowerCase();
}

function formatWindowsCommand(command, args) {
  return [command, ...args.map(quoteWindowsArgument)].join(" ");
}

function quoteWindowsArgument(argument) {
  const value = String(argument);
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '^"')}"`;
}
