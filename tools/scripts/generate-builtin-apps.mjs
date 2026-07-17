import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSyncCommand } from "./command-helpers.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(scriptDir, "..", "..");

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
