import assert from "node:assert/strict";
import test from "node:test";
import { shouldLoadWorkspaceAppFactoryDependencies } from "./workspaceAppCenterLoadPolicy.ts";

test("loads app-factory dependencies only for the my-apps tab", () => {
  assert.equal(shouldLoadWorkspaceAppFactoryDependencies("recommended"), false);
  assert.equal(shouldLoadWorkspaceAppFactoryDependencies("community"), false);
  assert.equal(shouldLoadWorkspaceAppFactoryDependencies("my"), true);
});
