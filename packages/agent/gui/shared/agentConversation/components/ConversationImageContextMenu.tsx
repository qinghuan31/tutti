import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "../../../app/renderer/components/ui/context-menu";
import { useOptionalAgentHostApi } from "../../../agentActivityHost";
import { copyImageToClipboard } from "../lib/copyImageToClipboard";
import { translate } from "../../../i18n/index";

type ImageActionStatus = "copying" | "success" | "failed" | "download";

export function ConversationImageContextMenu({
  src,
  children,
  asChild = false,
  contentStyle,
  downloadName
}: {
  src: string;
  children: ReactNode;
  downloadName?: string;
  /**
   * Attach the right-click listener directly to the child element instead of a
   * wrapper span. Used for the zoomed image, whose positioning the zoom library
   * manages and must not be disturbed by an extra wrapper element.
   */
  asChild?: boolean;
  /**
   * Override the menu content style. Used by the zoomed image to raise the
   * menu above the zoom modal (which sits above the default popover z-index).
   */
  contentStyle?: CSSProperties;
}): JSX.Element {
  const agentHostApi = useOptionalAgentHostApi();
  const [menuResetKey, setMenuResetKey] = useState(0);
  const [contentVisible, setContentVisible] = useState(false);
  const [actionStatus, setActionStatus] = useState<ImageActionStatus | null>(
    null
  );
  const actionPendingRef = useRef(false);

  const handleCopy = useCallback(() => {
    setActionStatus("copying");
    void copyImageToClipboard(src, agentHostApi?.clipboard).then((ok) => {
      setActionStatus(ok ? "success" : "failed");
    });
  }, [agentHostApi?.clipboard, src]);

  const handleDownload = useCallback(() => {
    downloadImage(src, downloadName || "image.png");
    setActionStatus("download");
  }, [downloadName, src]);

  const runMenuAction = useCallback((action: () => void) => {
    if (actionPendingRef.current) {
      return;
    }
    actionPendingRef.current = true;
    action();
  }, []);

  const handleMenuItemSelect = useCallback(
    (event: Event, action: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      runMenuAction(action);
    },
    [runMenuAction]
  );

  const handleMenuItemPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, action: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      runMenuAction(action);
    },
    [runMenuAction]
  );
  const stopMenuItemEvent = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );
  const handleMenuItemClick = useCallback(
    (event: SyntheticEvent<HTMLElement>, action: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      runMenuAction(action);
      setContentVisible(false);
      setMenuResetKey((key) => key + 1);
      actionPendingRef.current = false;
    },
    [runMenuAction]
  );

  useEffect(() => {
    if (!actionStatus) {
      return;
    }
    const timer = setTimeout(() => setActionStatus(null), 1600);
    return () => clearTimeout(timer);
  }, [actionStatus]);

  return (
    <>
      <ContextMenu key={menuResetKey} modal={false}>
        <ContextMenuTrigger
          asChild={asChild}
          onContextMenu={() => setContentVisible(true)}
        >
          {children}
        </ContextMenuTrigger>
        {contentVisible ? (
          <ContextMenuContent
            style={{
              minWidth: 148,
              zIndex: 100302,
              ...contentStyle
            }}
          >
            <ContextMenuItem
              onClick={(event) => handleMenuItemClick(event, handleCopy)}
              onPointerDown={(event) =>
                handleMenuItemPointerDown(event, handleCopy)
              }
              onPointerUp={stopMenuItemEvent}
              onSelect={(event) => handleMenuItemSelect(event, handleCopy)}
            >
              <span>{translate("agentHost.agentGui.copyImage")}</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={(event) => handleMenuItemClick(event, handleDownload)}
              onPointerDown={(event) =>
                handleMenuItemPointerDown(event, handleDownload)
              }
              onPointerUp={stopMenuItemEvent}
              onSelect={(event) => handleMenuItemSelect(event, handleDownload)}
            >
              <span>{translate("common.downloadImage")}</span>
            </ContextMenuItem>
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
      {actionStatus ? (
        <span className="tsh-image-copy-status" role="status">
          {translate(imageActionStatusMessageKey(actionStatus))}
        </span>
      ) : null}
    </>
  );
}

function imageActionStatusMessageKey(status: ImageActionStatus): string {
  if (status === "copying") {
    return "agentHost.agentGui.imageCopying";
  }
  if (status === "success") {
    return "agentHost.agentGui.imageCopied";
  }
  if (status === "download") {
    return "agentHost.agentGui.imageDownloadStarted";
  }
  return "agentHost.agentGui.imageCopyFailed";
}

function downloadImage(src: string, name: string): void {
  const link = document.createElement("a");
  link.href = src;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}
