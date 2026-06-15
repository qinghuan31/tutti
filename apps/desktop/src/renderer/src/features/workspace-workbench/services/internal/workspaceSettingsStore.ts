import { proxy } from "valtio";
import type { WorkspaceSettingsStoreState } from "../workspaceSettingsTypes";
import { readDeveloperPanelVisible } from "./developerPanelVisibility.ts";

export function createWorkspaceSettingsStore(): WorkspaceSettingsStoreState {
  return proxy({
    activeSection: "general",
    developerPanelVisible: readDeveloperPanelVisible(),
    developerLogs: {
      clearing: false,
      exporting: false,
      loading: false,
      logs: null
    },
    managedModels: {
      deletingProvider: null,
      detectingProvider: null,
      draft: null,
      feedback: {},
      focusedProvider: null,
      focusRequestID: 0,
      loading: false,
      providers: [],
      savingProvider: null,
      testingProvider: null
    },
    open: false,
    workspaceID: null
  });
}
