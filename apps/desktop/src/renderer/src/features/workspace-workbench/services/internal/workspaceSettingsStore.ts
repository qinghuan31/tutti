import { proxy } from "valtio";
import type { WorkspaceSettingsStoreState } from "../workspaceSettingsTypes";

export function createWorkspaceSettingsStore(): WorkspaceSettingsStoreState {
  return proxy({
    activeSection: "general",
    developerLogs: {
      clearing: false,
      exporting: false,
      loading: false,
      logs: null
    },
    managedModels: {
      deletingProvider: null,
      detectingProvider: null,
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
