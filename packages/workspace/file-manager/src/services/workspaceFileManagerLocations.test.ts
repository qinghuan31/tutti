import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspaceFileLocationDefaultId } from "./workspaceFileManagerLocations.ts";
import type { WorkspaceFileLocationSection } from "./workspaceFileManagerTypes.ts";

const sections: WorkspaceFileLocationSection[] = [
  {
    id: "local",
    label: "Local",
    locations: [
      {
        id: "local:home",
        kind: "directory",
        label: "Home",
        path: "/Users/demo",
        referenceNodeId: "ref-home"
      },
      {
        id: "recent",
        kind: "recent",
        label: "Recent"
      }
    ]
  },
  {
    id: "project",
    label: "Project",
    locations: [
      {
        id: "project:repo",
        kind: "directory",
        label: "Repo",
        path: "/Users/demo/repo",
        referenceNodeId: "ref-repo"
      }
    ]
  }
];

test("location default id prefers the persisted location when it still exists", () => {
  assert.equal(
    resolveWorkspaceFileLocationDefaultId({
      defaultLocationId: "local:home",
      persistedLocationId: "project:repo",
      sections
    }),
    "project:repo"
  );
});

test("location default id falls back to the preferred default location", () => {
  assert.equal(
    resolveWorkspaceFileLocationDefaultId({
      defaultLocationId: "project:repo",
      persistedLocationId: "missing",
      sections
    }),
    "project:repo"
  );
});

test("location default id falls back to the first available location", () => {
  assert.equal(
    resolveWorkspaceFileLocationDefaultId({
      defaultLocationId: "missing",
      persistedLocationId: "missing",
      sections
    }),
    "local:home"
  );
});

test("location default id returns null when no locations exist", () => {
  assert.equal(
    resolveWorkspaceFileLocationDefaultId({
      defaultLocationId: "missing",
      persistedLocationId: "missing",
      sections: []
    }),
    null
  );
});
