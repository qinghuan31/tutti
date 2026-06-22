#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  rmdir,
  stat,
  writeFile
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultStateDirNames = [".tutti-dev", ".tutti"];
const sidecarManifestFileName = "sidecar-manifest.json";

export function parseArgs(argv) {
  const options = {
    apply: false,
    help: false,
    homeDir: homedir(),
    skipDb: false,
    stateDirs: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--apply":
        options.apply = true;
        break;
      case "--dry-run":
        options.apply = false;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--home": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--home requires a path");
        }
        options.homeDir = value;
        index += 1;
        break;
      }
      case "--skip-db":
        options.skipDb = true;
        break;
      case "--state-dir": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--state-dir requires a path");
        }
        options.stateDirs.push(value);
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (options.stateDirs.length === 0) {
    options.stateDirs = defaultStateDirNames.map((name) =>
      join(options.homeDir, name)
    );
  }

  return options;
}

export function usage() {
  return `Usage: node migrate-local-state-layout.mjs [options]

Migrates pre-release Tutti local state directories to the workspaceId-free
layout used by current builds. The script is standalone and defaults to
dry-run mode.

From a Tutti source checkout, this is the same as:
  node tools/scripts/migrate-local-state-layout.mjs [options]

Options:
  --apply              Perform filesystem and SQLite changes.
  --dry-run            Show planned changes without writing. This is the default.
  --home <path>        Use a custom home directory. Defaults to the current user home.
  --state-dir <path>   Migrate one explicit state directory. May be repeated.
  --skip-db            Do not update tuttid.db workspace_agent_sessions.cwd rows.
  -h, --help           Show this help.

Default state directories:
  ~/.tutti-dev
  ~/.tutti

Stop Tutti Desktop and tuttid before running with --apply. Applying database
updates requires the sqlite3 command on PATH; use --skip-db only if you plan to
handle tuttid.db separately.`;
}

export async function migrateStateDirs(options = {}) {
  const stateDirs =
    options.stateDirs ??
    defaultStateDirNames.map((name) => join(homedir(), name));
  const results = [];
  for (const stateDir of stateDirs) {
    results.push(await migrateStateDir({ ...options, stateDir }));
  }
  return results;
}

export async function migrateStateDir(options) {
  const stateDir = resolveRequiredPath(options.stateDir, "stateDir");
  const apply = options.apply === true;
  const skipDb = options.skipDb === true;

  if (apply) {
    const preflight = await migrateStateDirOnce({
      apply: false,
      preflight: true,
      skipDb,
      stateDir
    });
    if (preflight.conflicts.length > 0 || preflight.errors.length > 0) {
      return {
        ...preflight,
        aborted: true,
        apply
      };
    }
  }

  return migrateStateDirOnce({ apply, preflight: false, skipDb, stateDir });
}

async function migrateStateDirOnce(input) {
  const context = {
    aborted: false,
    actions: [],
    apply: input.apply,
    conflicts: [],
    errors: [],
    preflight: input.preflight,
    runRootMoves: [],
    sessionRootRewrite: null,
    skipDb: input.skipDb,
    stateDir: input.stateDir,
    warnings: []
  };

  if (!(await pathExists(context.stateDir))) {
    context.warnings.push(
      `state directory does not exist: ${context.stateDir}`
    );
    return context;
  }

  await migrateSessionDirectories(context);
  await migrateAgentRuns(context);
  await migratePromptAttachments(context);
  await migrateWorkspaceApps(context);
  await rewriteSidecarManifests(context);
  await updateAgentSessionCwdRows(context);

  return context;
}

async function migrateSessionDirectories(context) {
  const fromRoot = join(context.stateDir, "sessions");
  const toRoot = join(context.stateDir, "agent", "sessions");
  context.sessionRootRewrite = { from: fromRoot, to: toRoot };

  const entries = await readDirectoryEntries(fromRoot);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    await movePath(context, {
      from: join(fromRoot, entry.name),
      label: "agent session cwd",
      to: join(toRoot, entry.name)
    });
  }
  await removeEmptyDirectory(context, fromRoot);
}

async function migrateAgentRuns(context) {
  const runsRoot = join(context.stateDir, "agent", "runs");
  const workspaceEntries = await readDirectoryEntries(runsRoot);

  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) {
      continue;
    }
    const workspaceRunRoot = join(runsRoot, workspaceEntry.name);
    if (await looksLikeRunDirectory(workspaceRunRoot)) {
      continue;
    }

    const sessionEntries = await readDirectoryEntries(workspaceRunRoot);
    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) {
        continue;
      }
      const oldRunRoot = join(workspaceRunRoot, sessionEntry.name);
      const newRunRoot = join(runsRoot, sessionEntry.name);
      context.runRootMoves.push({ from: oldRunRoot, to: newRunRoot });
      await movePath(context, {
        from: oldRunRoot,
        label: "agent sidecar run",
        to: newRunRoot
      });
    }
    await removeEmptyDirectory(context, workspaceRunRoot);
  }
}

async function migratePromptAttachments(context) {
  const oldRoot = join(context.stateDir, "agent-session-attachments");
  const newRoot = join(context.stateDir, "agent", "attachments");
  const workspaceEntries = await readDirectoryEntries(oldRoot);

  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) {
      continue;
    }
    const workspaceRoot = join(oldRoot, workspaceEntry.name);
    const sessionEntries = await readDirectoryEntries(workspaceRoot);
    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) {
        continue;
      }
      await movePath(context, {
        from: join(workspaceRoot, sessionEntry.name),
        label: "agent prompt attachments",
        to: join(newRoot, sessionEntry.name)
      });
    }
    await removeEmptyDirectory(context, workspaceRoot);
  }
  await removeEmptyDirectory(context, oldRoot);
}

async function migrateWorkspaceApps(context) {
  const oldRoot = join(context.stateDir, "apps", "workspaces");
  const workspaceEntries = await readDirectoryEntries(oldRoot);

  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) {
      continue;
    }
    const workspaceRoot = join(oldRoot, workspaceEntry.name);
    const appEntries = await readDirectoryEntries(workspaceRoot);
    for (const appEntry of appEntries) {
      if (!appEntry.isDirectory()) {
        continue;
      }
      const appId = appEntry.name;
      await movePath(context, {
        from: join(workspaceRoot, appId),
        label: "workspace app installation state",
        to: join(
          context.stateDir,
          "apps",
          "installations",
          safePathSegment(appId),
          workspaceAppScopeSegment(workspaceEntry.name, appId)
        )
      });
    }
    await removeEmptyDirectory(context, workspaceRoot);
  }
  await removeEmptyDirectory(context, oldRoot);
}

async function rewriteSidecarManifests(context) {
  const runsRoot = join(context.stateDir, "agent", "runs");
  const runEntries = await readDirectoryEntries(runsRoot);
  const rewrites = [context.sessionRootRewrite, ...context.runRootMoves].filter(
    Boolean
  );

  if (rewrites.length === 0) {
    return;
  }

  for (const runEntry of runEntries) {
    if (!runEntry.isDirectory()) {
      continue;
    }
    const manifestPath = join(runsRoot, runEntry.name, sidecarManifestFileName);
    if (!(await pathExists(manifestPath))) {
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      context.errors.push(
        `cannot parse sidecar manifest ${manifestPath}: ${error.message}`
      );
      continue;
    }

    const next = rewriteManifestPaths(manifest, rewrites);
    if (!next.changed) {
      continue;
    }

    context.actions.push({
      label: "sidecar manifest paths",
      path: manifestPath,
      type: context.apply ? "update-file" : "would-update-file"
    });
    if (context.apply) {
      await writeFile(
        manifestPath,
        `${JSON.stringify(next.manifest, null, 2)}\n`
      );
    }
  }
}

export function rewriteManifestPaths(manifest, rewrites) {
  let changed = false;
  const next = structuredClone(manifest);

  for (const key of ["cwd", "runtimeRoot"]) {
    if (typeof next[key] !== "string") {
      continue;
    }
    const value = rewritePathPrefix(next[key], rewrites);
    if (value !== next[key]) {
      next[key] = value;
      changed = true;
    }
  }

  if (Array.isArray(next.managedFiles)) {
    for (const file of next.managedFiles) {
      if (!file || typeof file.path !== "string") {
        continue;
      }
      const value = rewritePathPrefix(file.path, rewrites);
      if (value !== file.path) {
        file.path = value;
        changed = true;
      }
    }
  }

  return { changed, manifest: next };
}

async function updateAgentSessionCwdRows(context) {
  if (context.skipDb) {
    return;
  }
  const dbPath = join(context.stateDir, "tuttid.db");
  if (!(await pathExists(dbPath))) {
    return;
  }

  const oldPrefix = join(context.stateDir, "sessions");
  const newPrefix = join(context.stateDir, "agent", "sessions");
  if (!hasSqlite3()) {
    const message = `sqlite3 is required to update workspace_agent_sessions.cwd in ${dbPath}`;
    if (context.apply || context.preflight) {
      context.errors.push(message);
    } else {
      context.warnings.push(`${message}; dry-run row count skipped`);
    }
    return;
  }

  if (existsSync(`${dbPath}-wal`)) {
    context.warnings.push(
      `${dbPath}-wal exists; stop Tutti Desktop and tuttid before applying`
    );
  }

  const tableExists = sqliteScalar(
    dbPath,
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='workspace_agent_sessions';"
  );
  if (tableExists !== "1") {
    return;
  }

  const countSQL = `SELECT count(*) FROM workspace_agent_sessions WHERE ${cwdWhereSQL(oldPrefix)};`;
  const matchingRows = Number(sqliteScalar(dbPath, countSQL) || "0");
  if (matchingRows === 0) {
    return;
  }

  context.actions.push({
    from: oldPrefix,
    label: "workspace_agent_sessions.cwd",
    rows: matchingRows,
    to: newPrefix,
    type: context.apply ? "update-sqlite" : "would-update-sqlite"
  });

  if (!context.apply) {
    return;
  }

  await backupSqliteFiles(context, dbPath);
  const updateSQL = `
BEGIN IMMEDIATE;
UPDATE workspace_agent_sessions
SET cwd = ${sqlString(newPrefix)} || substr(cwd, length(${sqlString(oldPrefix)}) + 1)
WHERE ${cwdWhereSQL(oldPrefix)};
COMMIT;
`;
  execFileSync("sqlite3", [dbPath, updateSQL], { encoding: "utf8" });
}

async function backupSqliteFiles(context, dbPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${dbPath}${suffix}`;
    if (!existsSync(source)) {
      continue;
    }
    const target = `${source}.before-local-state-layout-migration-${stamp}`;
    context.actions.push({
      from: source,
      label: "sqlite backup",
      to: target,
      type: "copy-file"
    });
    await copyFile(source, target);
  }
}

async function movePath(context, input) {
  const from = resolve(input.from);
  const to = resolve(input.to);
  assertInsideStateDir(context, from);
  assertInsideStateDir(context, to);

  if (!(await pathExists(from))) {
    return;
  }
  if (from === to) {
    return;
  }

  const fromStat = await lstat(from);
  const toExists = await pathExists(to);
  if (!toExists) {
    context.actions.push({
      from,
      label: input.label,
      to,
      type: context.apply ? "move" : "would-move"
    });
    if (context.apply) {
      await mkdir(dirname(to), { recursive: true });
      await renameOrCopy(from, to);
    }
    return;
  }

  const toStat = await lstat(to);
  if (fromStat.isDirectory() && toStat.isDirectory()) {
    context.actions.push({
      from,
      label: input.label,
      to,
      type: context.apply ? "merge-directory" : "would-merge-directory"
    });
    await mergeDirectory(context, from, to, input.label);
    await removeEmptyDirectory(context, from);
    return;
  }

  if (await sameFilesystemEntry(from, to, fromStat, toStat)) {
    context.actions.push({
      from,
      label: input.label,
      to,
      type: context.apply
        ? "remove-identical-source"
        : "would-remove-identical-source"
    });
    if (context.apply) {
      await rm(from, { force: true, recursive: true });
    }
    return;
  }

  context.conflicts.push(
    `target already exists with different content: ${to} (from ${from})`
  );
}

async function mergeDirectory(context, fromDir, toDir, label) {
  const entries = await readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    await movePath(context, {
      from: join(fromDir, entry.name),
      label,
      to: join(toDir, entry.name)
    });
  }
}

async function removeEmptyDirectory(context, directory) {
  if (!(await pathExists(directory))) {
    return;
  }
  const entries = await readDirectoryEntries(directory);
  if (entries.length > 0) {
    return;
  }
  context.actions.push({
    path: directory,
    type: context.apply
      ? "remove-empty-directory"
      : "would-remove-empty-directory"
  });
  if (context.apply) {
    await rmdir(directory);
  }
}

async function renameOrCopy(from, to) {
  try {
    await rename(from, to);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    await cp(from, to, {
      force: false,
      recursive: true,
      verbatimSymlinks: true
    });
    await rm(from, { force: true, recursive: true });
  }
}

async function sameFilesystemEntry(from, to, fromStat, toStat) {
  if (fromStat.isSymbolicLink() || toStat.isSymbolicLink()) {
    if (!fromStat.isSymbolicLink() || !toStat.isSymbolicLink()) {
      return false;
    }
    return (await readlink(from)) === (await readlink(to));
  }
  if (!fromStat.isFile() || !toStat.isFile()) {
    return false;
  }
  if (fromStat.size !== toStat.size) {
    return false;
  }
  return (await readFile(from)).equals(await readFile(to));
}

async function looksLikeRunDirectory(directory) {
  return (
    (await pathExists(join(directory, sidecarManifestFileName))) ||
    (await isDirectory(join(directory, "codex-home")))
  );
}

function rewritePathPrefix(value, rewrites) {
  let output = value;
  for (const rewrite of rewrites) {
    output = replacePathPrefix(output, rewrite.from, rewrite.to);
  }
  return output;
}

function replacePathPrefix(value, from, to) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  const normalizedFrom = resolve(from);
  const normalizedValue = resolve(value);
  if (normalizedValue === normalizedFrom) {
    return to;
  }
  const prefix = `${normalizedFrom}${sep}`;
  if (!normalizedValue.startsWith(prefix)) {
    return value;
  }
  return `${to}${normalizedValue.slice(normalizedFrom.length)}`;
}

export function safePathSegment(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "_";
  }
  const safe = Array.from(trimmed)
    .map((char) => (/^[\p{L}\p{N}_.-]$/u.test(char) ? char : "_"))
    .join("");
  return safe || "_";
}

export function workspaceAppScopeSegment(workspaceId, appId) {
  return createHash("sha256")
    .update(
      `${String(workspaceId ?? "").trim()}\0${String(appId ?? "").trim()}`
    )
    .digest("hex")
    .slice(0, 16);
}

async function readDirectoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function hasSqlite3() {
  return (
    spawnSync("sqlite3", ["--version"], {
      encoding: "utf8"
    }).status === 0
  );
}

function sqliteScalar(dbPath, sql) {
  return execFileSync("sqlite3", [dbPath, sql], {
    encoding: "utf8"
  }).trim();
}

function cwdWhereSQL(oldPrefix) {
  return `(cwd = ${sqlString(oldPrefix)} OR substr(cwd, 1, length(${sqlString(oldPrefix)}) + 1) = ${sqlString(`${oldPrefix}/`)})`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function resolveRequiredPath(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return resolve(value);
}

function assertInsideStateDir(context, path) {
  const rel = relative(context.stateDir, path);
  if (
    rel === "" ||
    (!rel.startsWith("..") && rel !== ".." && !isAbsolute(rel))
  ) {
    return;
  }
  throw new Error(`refusing to touch path outside state directory: ${path}`);
}

function summarize(results, apply) {
  const lines = [
    `Tutti local state layout migration (${apply ? "apply" : "dry-run"})`
  ];
  if (!apply) {
    lines.push("No changes were written. Re-run with --apply to migrate.");
  }
  for (const result of results) {
    lines.push("");
    lines.push(result.stateDir);
    if (result.aborted) {
      lines.push("  aborted before writing due to conflicts or errors");
    }
    if (result.actions.length === 0) {
      lines.push("  no migration actions");
    }
    for (const action of result.actions) {
      lines.push(`  - ${formatAction(action)}`);
    }
    for (const warning of result.warnings) {
      lines.push(`  warning: ${warning}`);
    }
    for (const conflict of result.conflicts) {
      lines.push(`  conflict: ${conflict}`);
    }
    for (const error of result.errors) {
      lines.push(`  error: ${error}`);
    }
  }
  return lines.join("\n");
}

function formatAction(action) {
  switch (action.type) {
    case "would-move":
    case "move":
    case "would-merge-directory":
    case "merge-directory":
    case "would-remove-identical-source":
    case "remove-identical-source":
    case "copy-file":
      return `${action.type} ${action.label ?? "path"}: ${action.from} -> ${action.to}`;
    case "would-update-sqlite":
    case "update-sqlite":
      return `${action.type} ${action.label}: ${action.rows} row(s), ${action.from} -> ${action.to}`;
    case "would-update-file":
    case "update-file":
      return `${action.type} ${action.label}: ${action.path}`;
    case "would-remove-empty-directory":
    case "remove-empty-directory":
      return `${action.type}: ${action.path}`;
    default:
      return JSON.stringify(action);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const results = await migrateStateDirs(options);
  console.log(summarize(results, options.apply));
  if (
    results.some(
      (result) =>
        result.aborted ||
        result.conflicts.length > 0 ||
        result.errors.length > 0
    )
  ) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
