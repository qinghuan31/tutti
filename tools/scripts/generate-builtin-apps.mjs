import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWindows, spawnSyncCommand } from "./command-helpers.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(scriptDir, "..", "..");

if (isWindows()) {
  console.log(
    "[generate-builtin-apps] skipping builtin onboarding packaging on Windows"
  );
  process.exit(0);
}

const result = spawnSyncCommand(
  "pnpm",
  ["--filter", "@tutti-os/builtin-tutti-onboarding", "package:builtin"],
  {
    cwd: workspaceRoot,
    stdio: "inherit"
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
