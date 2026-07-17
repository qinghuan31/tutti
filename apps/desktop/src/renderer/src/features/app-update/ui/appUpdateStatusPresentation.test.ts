import assert from "node:assert/strict";
import test from "node:test";
import type { AppUpdateViewState } from "../services/appUpdateTypes.ts";
import { resolveStandaloneAppUpdateStatusPresentation } from "./appUpdateStatusPresentation.ts";

test("standalone update status exposes only compact actions and active progress", () => {
  assert.deepEqual(
    resolveStandaloneAppUpdateStatusPresentation(
      view({
        action: "download",
        actionKey: "updates.downloadAction",
        titleKey: "updates.availableTitle"
      })
    ),
    {
      actionKey: "updates.downloadAction",
      kind: "action",
      titleKey: "updates.availableTitle",
      titleParams: undefined
    }
  );
  assert.deepEqual(
    resolveStandaloneAppUpdateStatusPresentation(
      view({
        titleKey: "updates.downloadingTitle",
        titleParams: { percent: "42%" }
      })
    ),
    {
      kind: "status",
      titleKey: "updates.downloadingTitle",
      titleParams: { percent: "42%" }
    }
  );
});

test("standalone update status hides non-actionable failures", () => {
  assert.equal(
    resolveStandaloneAppUpdateStatusPresentation(
      view({ tone: "error", titleKey: "updates.errorTitle" })
    ),
    null
  );
});

function view(overrides: Partial<AppUpdateViewState> = {}): AppUpdateViewState {
  return {
    action: null,
    actionKey: null,
    busy: false,
    icon: "spark",
    progressPercent: null,
    titleKey: "updates.checkingTitle",
    tone: "info",
    visible: true,
    ...overrides
  };
}
