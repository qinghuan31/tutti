import assert from "node:assert/strict";
import test from "node:test";
import { shouldExposeWorkspaceSurfaceApis } from "./workspaceSurfacePreload.ts";

test("workspace surface preload exposes browser APIs to workspace and Agent windows", () => {
  assert.equal(shouldExposeWorkspaceSurfaceApis("?view=workspace"), true);
  assert.equal(shouldExposeWorkspaceSurfaceApis("?view=agent"), true);
  assert.equal(shouldExposeWorkspaceSurfaceApis("?view=dashboard"), false);
  assert.equal(shouldExposeWorkspaceSurfaceApis(""), false);
});
