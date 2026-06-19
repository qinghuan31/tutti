import assert from "node:assert/strict";
import test from "node:test";
import { openWorkspaceOnboardingIfNeeded } from "./useWorkspaceOnboardingAutoOpen.ts";

test("workspace onboarding auto-open marks only after the app opens", async () => {
  let markCalls = 0;
  let openCalls = 0;
  const result = await openWorkspaceOnboardingIfNeeded({
    appCenterService: {
      store: {
        apps: [
          {
            appId: "tutti-onboarding",
            installed: true
          }
        ]
      },
      async refresh() {},
      async refreshCatalog() {},
      async installApp() {},
      async openApp() {
        openCalls += 1;
        return false;
      }
    },
    wait: async () => {},
    workbenchHostService: {
      async hasWorkspaceOnboardingAutoOpened() {
        return false;
      },
      async markWorkspaceOnboardingAutoOpened() {
        markCalls += 1;
      }
    },
    workspaceId: "workspace-1"
  });

  assert.equal(result, "not-opened");
  assert.equal(openCalls, 1);
  assert.equal(markCalls, 0);
});
