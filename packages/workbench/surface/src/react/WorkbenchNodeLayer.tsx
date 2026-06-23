import { memo, useMemo } from "react";
import {
  selectFocusedWorkbenchNode,
  selectWorkbenchNodeZIndex,
  selectWorkbenchSnapPreviewRect
} from "../core/selectors.ts";
import type { WorkbenchNode } from "../core/types.ts";
import type {
  WorkbenchKeepMinimizedNodeMounted,
  WorkbenchRenderNode,
  WorkbenchSurfacePresentation,
  WorkbenchRenderWindowActions,
  WorkbenchRenderWindowHeader,
  WorkbenchResolveFullscreenHeaderMode,
  WorkbenchResolveWindowChromeMode,
  WorkbenchWindowChromeMode
} from "./types.ts";
import type { WorkbenchGenieController } from "./useWorkbenchGenieAnimation.tsx";
import { useWorkbenchController } from "./WorkbenchProvider.tsx";
import { WorkbenchWindowFrame } from "./WorkbenchWindowFrame.tsx";
import { useWorkbenchSelector } from "./hooks/useWorkbenchSelector.ts";
import { createRenderedWorkbenchNodeIDsSelector } from "./renderedNodeIds.ts";
import type { WorkbenchWindowChromeI18nRuntime } from "./workbenchWindowI18n.ts";
import { resolveWorkbenchWindowChromeMode } from "./windowHeader.ts";

export interface WorkbenchNodeLayerProps<TData = unknown> {
  genie: WorkbenchGenieController<TData>;
  interactive?: boolean;
  presentation?: WorkbenchSurfacePresentation | null;
  renderNode: WorkbenchRenderNode<TData>;
  shouldKeepMinimizedNodeMounted?: WorkbenchKeepMinimizedNodeMounted<TData>;
  renderWindowActions?: WorkbenchRenderWindowActions<TData>;
  renderWindowHeader?: WorkbenchRenderWindowHeader<TData>;
  resolveFullscreenHeaderMode?: WorkbenchResolveFullscreenHeaderMode<TData>;
  windowChromeMode?:
    | WorkbenchWindowChromeMode
    | WorkbenchResolveWindowChromeMode<TData>;
  windowChromeI18n?: WorkbenchWindowChromeI18nRuntime;
}

export function WorkbenchNodeLayer<TData>({
  genie,
  interactive = true,
  presentation,
  renderNode,
  shouldKeepMinimizedNodeMounted,
  renderWindowActions,
  renderWindowHeader,
  resolveFullscreenHeaderMode,
  windowChromeMode,
  windowChromeI18n
}: WorkbenchNodeLayerProps<TData>) {
  const selectRenderedNodeIDs = useMemo(
    () =>
      createRenderedWorkbenchNodeIDsSelector(shouldKeepMinimizedNodeMounted),
    [shouldKeepMinimizedNodeMounted]
  );
  const nodeIDs = useWorkbenchSelector<TData, readonly string[]>(
    selectRenderedNodeIDs
  );
  const snapPreviewRect = useWorkbenchSelector(selectWorkbenchSnapPreviewRect);
  const presentationInteraction =
    interactive && presentation?.mode === "mission-control"
      ? (presentation.interaction ?? null)
      : null;

  return (
    <div
      className="workbench-node-layer"
      onClick={
        presentationInteraction
          ? (event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              presentationInteraction.onBackdropPress();
            }
          : undefined
      }
    >
      {snapPreviewRect ? (
        <div
          className="workbench-snap-preview"
          style={{
            height: snapPreviewRect.height,
            left: snapPreviewRect.x,
            top: snapPreviewRect.y,
            width: snapPreviewRect.width
          }}
        />
      ) : null}
      {nodeIDs.map((nodeID) => (
        <MemoizedWorkbenchNodeLayerItem
          key={nodeID}
          fullscreenHeaderMode={resolveFullscreenHeaderMode}
          genie={genie}
          interactive={interactive}
          nodeID={nodeID}
          presentation={presentation}
          renderNode={renderNode}
          renderWindowActions={renderWindowActions}
          renderWindowHeader={renderWindowHeader}
          windowChromeI18n={windowChromeI18n}
          windowChromeMode={windowChromeMode}
        />
      ))}
    </div>
  );
}

interface WorkbenchNodeLayerItemProps<TData = unknown> {
  fullscreenHeaderMode?: WorkbenchResolveFullscreenHeaderMode<TData>;
  genie: WorkbenchGenieController<TData>;
  interactive: boolean;
  nodeID: string;
  presentation?: WorkbenchSurfacePresentation | null;
  renderNode: WorkbenchRenderNode<TData>;
  renderWindowActions?: WorkbenchRenderWindowActions<TData>;
  renderWindowHeader?: WorkbenchRenderWindowHeader<TData>;
  windowChromeMode?:
    | WorkbenchWindowChromeMode
    | WorkbenchResolveWindowChromeMode<TData>;
  windowChromeI18n?: WorkbenchWindowChromeI18nRuntime;
}

function WorkbenchNodeLayerItem<TData>({
  fullscreenHeaderMode,
  genie,
  interactive,
  nodeID,
  presentation,
  renderNode,
  renderWindowActions,
  renderWindowHeader,
  windowChromeI18n,
  windowChromeMode
}: WorkbenchNodeLayerItemProps<TData>) {
  const controller = useWorkbenchController<TData>();
  const node = useWorkbenchSelector<TData, WorkbenchNode<TData> | null>(
    (state) => state.nodes.find((candidate) => candidate.id === nodeID) ?? null
  );
  const isFocused = useWorkbenchSelector(
    (state) => selectFocusedWorkbenchNode(state)?.id === nodeID
  );
  const zIndex = useWorkbenchSelector((state) =>
    selectWorkbenchNodeZIndex(state, nodeID)
  );

  if (!node) {
    return null;
  }

  return (
    <WorkbenchWindowFrame
      hiddenMounted={node.isMinimized}
      interactive={interactive}
      presentation={presentation}
      node={node}
      genie={genie}
      fullscreenHeaderMode={fullscreenHeaderMode?.({
        controller,
        node
      })}
      renderActions={renderWindowActions}
      renderHeader={renderWindowHeader}
      windowChromeI18n={windowChromeI18n}
      windowChromeMode={resolveWorkbenchWindowChromeMode({
        controller,
        node,
        windowChromeMode
      })}
    >
      {renderNode({
        node,
        layout: {
          frame: node.frame,
          presentation,
          zIndex,
          isFocused
        },
        controller
      })}
    </WorkbenchWindowFrame>
  );
}

const MemoizedWorkbenchNodeLayerItem = memo(
  WorkbenchNodeLayerItem
) as typeof WorkbenchNodeLayerItem;
