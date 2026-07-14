import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL(
  "../../.github/workflows/windows-release.yml",
  import.meta.url
);
const buildScriptPath = new URL(
  "../../tools/scripts/build-desktop-package.mjs",
  import.meta.url
);

test("windows release workflow builds and publishes NSIS installers", async () => {
  const workflow = (await readFile(workflowPath, "utf8")).replaceAll(
    "\r\n",
    "\n"
  );

  assert.match(workflow, /push:\s*\n\s*tags:\s*\n\s*-\s*"v\*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on:\s+windows-latest/);
  assert.match(workflow, /pnpm --filter @tutti-os\/desktop build:win/);
  assert.match(workflow, /TUTTI_DESKTOP_RELEASE_TAG:/);
  assert.match(workflow, /Tutti-\*-win-x64\.exe/);
  assert.match(workflow, /generate-checksums\.mjs release-assets/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /contents:\s+write/);
});

test("Windows packaging hashes embedded Python without PowerShell cmdlets", async () => {
  const buildScript = await readFile(buildScriptPath, "utf8");

  assert.match(buildScript, /createHash\("sha256"\)/);
  assert.match(buildScript, /Expand-Archive/);
  assert.doesNotMatch(buildScript, /Get-FileHash/);
});
