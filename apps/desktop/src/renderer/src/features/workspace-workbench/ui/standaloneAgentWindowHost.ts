import type { DesktopApi } from "@preload/types";
import type {
  WorkbenchDockPreviewCache,
  WorkbenchFrame,
  WorkbenchHostHandle,
  WorkbenchSize
} from "@tutti-os/workbench-surface";

export function readStandaloneAgentWindowFrame(): WorkbenchFrame {
  return {
    ...readStandaloneAgentWindowSize(),
    x: 0,
    y: 0
  };
}

export function readStandaloneAgentWindowMaximizedState(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.tuttiWindowMaximized === "true"
  );
}

export function createStandaloneAgentDockPreviewCache(
  api: DesktopApi["dockPreviewCache"]
): WorkbenchDockPreviewCache {
  const pendingWriteKeys = new Set<string>();
  return {
    read(key) {
      return api.read({ key }).catch(() => null);
    },
    write({ key, previewImageUrl }) {
      const writeKey = JSON.stringify(key);
      if (pendingWriteKeys.has(writeKey)) {
        return;
      }
      pendingWriteKeys.add(writeKey);
      void api
        .write({ dataUrl: previewImageUrl, key })
        .catch(() => {})
        .finally(() => {
          pendingWriteKeys.delete(writeKey);
        });
    }
  };
}

export function createStandaloneAgentHost(input: {
  clearActivation(nodeId: string, sequence: number): void;
}): WorkbenchHostHandle {
  const snapshot = {
    activeDragNodeId: null,
    activeResizeNodeId: null,
    activeSnapTarget: null,
    lockedLayout: null,
    layoutConstraints: {
      minHeight: 0,
      minWidth: 0,
      safeArea: { bottom: 0, left: 0, right: 0, top: 0 },
      surfacePadding: 0
    },
    nodes: [],
    nodeStack: [],
    surfaceSize: readStandaloneAgentWindowSize()
  };
  return {
    activateNode: () => undefined,
    clearNodeActivation: input.clearActivation,
    closeNode: () => undefined,
    collectWindowCloseEffects: async () => [],
    dispose: () => undefined,
    exitFullscreenNode: () => undefined,
    focusNode: () => undefined,
    getSnapshot: () => ({
      ...snapshot,
      surfaceSize: readStandaloneAgentWindowSize()
    }),
    launchNode: async () => null,
    load: async () => undefined,
    minimizeNode: () => undefined,
    reconcileProjectedNodes: () => undefined,
    requestNodeClose: () => undefined,
    setNodeRuntimeState: () => undefined,
    setNodeSizeConstraints: () => undefined,
    setNodeTitle: () => undefined,
    setSnapshotNodeState: () => undefined
  };
}

function readStandaloneAgentWindowSize(): WorkbenchSize {
  return {
    height: Math.max(1, window.innerHeight),
    width: Math.max(1, window.innerWidth)
  };
}
