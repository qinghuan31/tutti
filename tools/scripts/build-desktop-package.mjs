import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSyncCommand } from "./command-helpers.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(scriptDir, "..", "..");
const appDir = join(workspaceRoot, "apps", "desktop");
const variant = process.argv[2] ?? "win";
const daemonBundleDir = join(appDir, "build", "tuttid");
const cliBundleDir = join(appDir, "build", "tutti");
const pythonRuntimeDir = join(appDir, "build", "python");
const goCacheDir = join(workspaceRoot, ".tmp", "go-build");
const pythonArchivePath = join(
  workspaceRoot,
  ".tmp",
  "python-3.12.10-embed-amd64.zip"
);
const pythonRuntimeVersion = "3.12.10";
const pythonRuntimeSHA256 =
  "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3";
const pythonRuntimeURL =
  "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip";

if (variant !== "win") {
  throw new Error(
    "build-desktop-package.mjs currently supports the win variant only."
  );
}

log(`variant=${variant} status=start`);
runPhase("prepare_builtin_apps", () =>
  runChecked(process.execPath, [join(scriptDir, "generate-builtin-apps.mjs")], {
    cwd: workspaceRoot
  })
);
runPhase("prepare_embedded_python", prepareEmbeddedPython);
runPhase("prepare_packaged_daemon", preparePackagedDaemon);
runPhase("prepare_browser_mcp", () =>
  runChecked(
    process.execPath,
    [join(appDir, "scripts", "vendor-browser-mcp.mjs")],
    {
      cwd: workspaceRoot
    }
  )
);
runPhase("prepare_claude_sdk_sidecar", () =>
  runChecked(
    process.execPath,
    [join(appDir, "scripts", "vendor-claude-sdk-sidecar.mjs")],
    {
      cwd: workspaceRoot
    }
  )
);

const desktopBuildVersion = resolveDesktopBuildVersion();
runPhase("pnpm_build", () =>
  runChecked("pnpm", ["build"], {
    cwd: appDir
  })
);
runPhase("electron_builder_win", () =>
  runChecked(
    "pnpm",
    [
      "exec",
      "electron-builder",
      "--win",
      "--publish",
      "never",
      `-c.extraMetadata.version=${desktopBuildVersion}`
    ],
    {
      cwd: appDir,
      env: {
        ...process.env,
        INIT_CWD: workspaceRoot,
        npm_package_json: join(workspaceRoot, "package.json")
      }
    }
  )
);
log(`variant=${variant} status=done`);

function preparePackagedDaemon() {
  rmSync(daemonBundleDir, { recursive: true, force: true });
  rmSync(cliBundleDir, { recursive: true, force: true });
  mkdirSync(daemonBundleDir, { recursive: true });
  mkdirSync(cliBundleDir, { recursive: true });

  runChecked("go", ["build", "-o", join(daemonBundleDir, "tuttid.exe"), "."], {
    cwd: join(workspaceRoot, "services", "tuttid"),
    env: resolveGoEnv()
  });
  runChecked(
    "go",
    ["build", "-o", join(cliBundleDir, "tutti.exe"), "./cmd/tutti"],
    {
      cwd: join(workspaceRoot, "apps", "cli"),
      env: resolveGoEnv()
    }
  );
}

function prepareEmbeddedPython() {
  const versionMarkerPath = join(pythonRuntimeDir, ".tutti-python-version");
  if (
    existsSync(join(pythonRuntimeDir, "python.exe")) &&
    existsSync(versionMarkerPath) &&
    readFileSync(versionMarkerPath, "utf8").trim() === pythonRuntimeVersion
  ) {
    return;
  }

  mkdirSync(dirname(pythonArchivePath), { recursive: true });
  rmSync(pythonRuntimeDir, { recursive: true, force: true });
  mkdirSync(pythonRuntimeDir, { recursive: true });
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$archive = " + powershellLiteral(pythonArchivePath),
    "$destination = " + powershellLiteral(pythonRuntimeDir),
    "$url = " + powershellLiteral(pythonRuntimeURL),
    "$expectedHash = " + powershellLiteral(pythonRuntimeSHA256),
    "Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive",
    "$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()",
    "if ($actualHash -ne $expectedHash) { throw 'Embedded Python SHA-256 mismatch.' }",
    "Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force"
  ].join("; ");
  runChecked(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command
    ],
    { cwd: workspaceRoot }
  );
  writeFileSync(versionMarkerPath, pythonRuntimeVersion + "\n", "utf8");
}

function resolveDesktopBuildVersion() {
  const explicitVersion = process.env.TUTTI_DESKTOP_BUILD_VERSION?.trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  const result = spawnSyncCommand(
    process.execPath,
    [join(appDir, "scripts", "resolve-build-version.mjs")],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"]
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `resolve-build-version failed with exit code ${result.status ?? "unknown"}`
    );
  }

  const version = result.stdout.trim();
  if (!version) {
    throw new Error("desktop build version is empty");
  }
  log(`desktop_version=${version}`);
  return version;
}

function runPhase(phase, callback) {
  const start = Date.now();
  log(`phase=${phase} status=start`);
  try {
    callback();
    log(
      `phase=${phase} status=done elapsed=${Math.max(
        0,
        Math.round((Date.now() - start) / 1000)
      )}s`
    );
  } catch (error) {
    log(
      `phase=${phase} status=failed elapsed=${Math.max(
        0,
        Math.round((Date.now() - start) / 1000)
      )}s`
    );
    throw error;
  }
}

function runChecked(command, args, options = {}) {
  const result = spawnSyncCommand(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: options.encoding,
    stdio: options.stdio ?? "inherit"
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`
    );
  }
  return result;
}

function log(message) {
  console.log(`[desktop-build] ${message}`);
}

function powershellLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function resolveGoEnv() {
  return {
    ...process.env,
    GOCACHE: process.env.GOCACHE?.trim() || goCacheDir,
    // Keep operator overrides intact, but fall back through mirrors before a
    // raw VCS fetch so Windows packaging does not depend on one proxy being
    // reachable from the local network.
    GOPROXY:
      process.env.GOPROXY?.trim() ||
      "https://proxy.golang.org,https://goproxy.io,https://goproxy.cn,direct"
  };
}
