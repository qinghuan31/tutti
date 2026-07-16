import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { retainWorkspaceAppInlineAppIds } from "./workspaceAppCenterInlineAppRetention.ts";

const inlineAppBodySource = readFileSync(
  new URL("./workspaceAppCenterInlineAppBody.tsx", import.meta.url),
  "utf8"
);

test("inline app retention keeps every app across catalog round trips", () => {
  const firstOpen = retainWorkspaceAppInlineAppIds({
    activeAppId: "ai-slide",
    retainedAppIds: []
  });
  const catalog = retainWorkspaceAppInlineAppIds({
    activeAppId: null,
    retainedAppIds: firstOpen
  });
  const secondOpen = retainWorkspaceAppInlineAppIds({
    activeAppId: "ai-doc",
    retainedAppIds: catalog
  });
  const reopenFirst = retainWorkspaceAppInlineAppIds({
    activeAppId: "ai-slide",
    retainedAppIds: secondOpen
  });

  assert.deepEqual(firstOpen, ["ai-slide"]);
  assert.equal(catalog, firstOpen);
  assert.deepEqual(secondOpen, ["ai-slide", "ai-doc"]);
  assert.equal(reopenFirst, secondOpen);
});

test("inline app retention prunes only against a confirmed available app list", () => {
  const retainedAppIds = ["ai-slide", "removed-app"];

  assert.equal(
    retainWorkspaceAppInlineAppIds({
      activeAppId: null,
      retainedAppIds
    }),
    retainedAppIds
  );
  assert.deepEqual(
    retainWorkspaceAppInlineAppIds({
      activeAppId: null,
      availableAppIds: ["ai-slide"],
      retainedAppIds
    }),
    ["ai-slide"]
  );
});

test("inline app body keeps retained browsers mounted and explicitly hidden", () => {
  assert.match(
    inlineAppBodySource,
    /retainedAppIds\.map\(\(retainedAppId\)\s*=>/
  );
  assert.match(
    inlineAppBodySource,
    /hidden=\{context\.node\.isMinimized \|\| !isActive\}/
  );
  assert.match(
    inlineAppBodySource,
    /nodeId=\{workspaceAppInlineBrowserNodeId\(retainedAppId\)\}/
  );
  assert.doesNotMatch(inlineAppBodySource, /catalogActive \? "visible"/);
  assert.doesNotMatch(inlineAppBodySource, /isActive \? "visible"/);
});
