import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  migrateStateDir,
  workspaceAppScopeSegment
} from "./migrate-local-state-layout.mjs";

test("migrateStateDir moves pre-release local state into the current layout", async () => {
  const stateDir = await createStateDir();
  const oldSessionDir = join(stateDir, "sessions", "2026-06-05-001");
  const oldRunDir = join(stateDir, "agent", "runs", "workspace-1", "session-1");
  const oldAttachmentDir = join(
    stateDir,
    "agent-session-attachments",
    "workspace-1",
    "session-1"
  );
  const oldAppDir = join(
    stateDir,
    "apps",
    "workspaces",
    "workspace-1",
    "app.alpha"
  );

  await writeText(join(oldSessionDir, "PROJECT_SUMMARY.md"), "summary");
  await writeText(join(oldAttachmentDir, "attachment-1.png"), "image");
  await writeText(join(oldAppDir, "logs", "runtime.log"), "runtime");
  await writeText(
    join(oldRunDir, "sidecar-manifest.json"),
    `${JSON.stringify(
      {
        version: 1,
        agentSessionId: "session-1",
        provider: "codex",
        cwd: oldSessionDir,
        runtimeRoot: oldRunDir,
        managedFiles: [
          {
            path: join(oldSessionDir, "AGENTS.md"),
            kind: "provider-instructions"
          }
        ],
        createdAtUnixMs: 1,
        updatedAtUnixMs: 1
      },
      null,
      2
    )}\n`
  );

  const result = await migrateStateDir({
    apply: true,
    skipDb: true,
    stateDir
  });

  assert.equal(result.aborted, false);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.errors, []);

  const newSessionDir = join(stateDir, "agent", "sessions", "2026-06-05-001");
  const newRunDir = join(stateDir, "agent", "runs", "session-1");
  const newAppDir = join(
    stateDir,
    "apps",
    "installations",
    "app.alpha",
    workspaceAppScopeSegment("workspace-1", "app.alpha")
  );

  assert.equal(existsSync(join(newSessionDir, "PROJECT_SUMMARY.md")), true);
  assert.equal(existsSync(join(newRunDir, "sidecar-manifest.json")), true);
  assert.equal(
    existsSync(
      join(stateDir, "agent", "attachments", "session-1", "attachment-1.png")
    ),
    true
  );
  assert.equal(existsSync(join(newAppDir, "logs", "runtime.log")), true);

  assert.equal(existsSync(oldSessionDir), false);
  assert.equal(existsSync(oldAttachmentDir), false);
  assert.equal(existsSync(oldAppDir), false);

  const manifest = JSON.parse(
    await readFile(join(newRunDir, "sidecar-manifest.json"), "utf8")
  );
  assert.equal(manifest.cwd, newSessionDir);
  assert.equal(manifest.runtimeRoot, newRunDir);
  assert.equal(manifest.managedFiles[0].path, join(newSessionDir, "AGENTS.md"));
});

test("migrateStateDir dry-run leaves local state untouched", async () => {
  const stateDir = await createStateDir();
  const oldAttachment = join(
    stateDir,
    "agent-session-attachments",
    "workspace-1",
    "session-1",
    "attachment-1.png"
  );
  const newAttachment = join(
    stateDir,
    "agent",
    "attachments",
    "session-1",
    "attachment-1.png"
  );
  await writeText(oldAttachment, "image");

  const result = await migrateStateDir({
    apply: false,
    skipDb: true,
    stateDir
  });

  assert.equal(result.aborted, false);
  assert.equal(
    result.actions.some((action) => action.type === "would-move"),
    true
  );
  assert.equal(existsSync(oldAttachment), true);
  assert.equal(existsSync(newAttachment), false);
});

test("migrateStateDir aborts before writing when a target conflict exists", async () => {
  const stateDir = await createStateDir();
  const oldAttachment = join(
    stateDir,
    "agent-session-attachments",
    "workspace-1",
    "session-1",
    "attachment-1.png"
  );
  const newAttachment = join(
    stateDir,
    "agent",
    "attachments",
    "session-1",
    "attachment-1.png"
  );
  await writeText(oldAttachment, "old image");
  await writeText(newAttachment, "new image");

  const result = await migrateStateDir({
    apply: true,
    skipDb: true,
    stateDir
  });

  assert.equal(result.aborted, true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(await readFile(oldAttachment, "utf8"), "old image");
  assert.equal(await readFile(newAttachment, "utf8"), "new image");
});

async function createStateDir() {
  const root = await mkdtemp(join(tmpdir(), "tutti-local-state-migration-"));
  const stateDir = join(root, ".tutti-dev");
  await mkdir(stateDir, { recursive: true });
  return stateDir;
}

async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
