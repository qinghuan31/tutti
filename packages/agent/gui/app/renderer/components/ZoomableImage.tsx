import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithoutRef,
  type JSX,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { CopyIcon, DownloadIcon } from "lucide-react";
import Zoom from "react-medium-image-zoom";
import { ViewportMenuSurface, menuItemClassName } from "@tutti-os/ui-system";
import { useTranslation } from "../../../i18n/index";
import { cn } from "../lib/utils";
import { useOptionalAgentHostApi } from "../../../agentActivityHost";
import { copyImageToClipboard } from "../../../shared/agentConversation/lib/copyImageToClipboard";

interface ZoomableImageProps extends ComponentPropsWithoutRef<"img"> {
  downloadName?: string;
  wrapElement?: "div" | "span";
}

interface ImageContextMenuState {
  point: { x: number; y: number };
  portalTarget: Element | null;
}

export function ZoomableImage({
  className,
  downloadName,
  onContextMenu,
  src,
  wrapElement = "div",
  ...props
}: ZoomableImageProps): JSX.Element {
  const { t } = useTranslation();
  const agentHostApi = useOptionalAgentHostApi();
  const actionSource =
    typeof src === "string" && src.trim() ? src.trim() : null;
  const hasImageActions = Boolean(actionSource && downloadName !== undefined);
  const resolvedDownloadName = useMemo(
    () => resolveImageDownloadName(downloadName, actionSource),
    [actionSource, downloadName]
  );
  const [copyStatusMessage, setCopyStatusMessage] = useState<string | null>(
    null
  );
  const [imageContextMenu, setImageContextMenu] =
    useState<ImageContextMenuState | null>(null);

  useEffect(() => {
    if (!copyStatusMessage) {
      return;
    }
    const timer = setTimeout(() => setCopyStatusMessage(null), 1600);
    return () => clearTimeout(timer);
  }, [copyStatusMessage]);

  const handleCopyImage = useCallback(async (): Promise<void> => {
    if (!actionSource) {
      return;
    }
    setCopyStatusMessage(t("agentHost.agentGui.imageCopying"));
    const copied = await copyImageToClipboard(
      actionSource,
      agentHostApi?.clipboard
    );
    setCopyStatusMessage(
      t(
        copied
          ? "agentHost.agentGui.imageCopied"
          : "agentHost.agentGui.imageCopyFailed"
      )
    );
  }, [actionSource, agentHostApi?.clipboard, t]);

  const handleCopyImageAction = useCallback((): void => {
    void handleCopyImage().catch(() => undefined);
  }, [handleCopyImage]);

  const handleDownloadImage = useCallback((): void => {
    if (!actionSource) {
      return;
    }
    downloadImage(actionSource, resolvedDownloadName);
    setCopyStatusMessage(t("agentHost.agentGui.imageDownloadStarted"));
  }, [actionSource, resolvedDownloadName, t]);

  const closeImageContextMenu = useCallback((): void => {
    setImageContextMenu(null);
  }, []);

  const handleImageContextMenu = useCallback(
    (event: MouseEvent<HTMLImageElement>): void => {
      onContextMenu?.(event);
      if (!hasImageActions || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setImageContextMenu({
        point: { x: event.clientX, y: event.clientY },
        portalTarget: event.currentTarget.closest(".tsh-zoom-dialog")
      });
    },
    [hasImageActions, onContextMenu]
  );

  const handleContextMenuCopy = useCallback((): void => {
    handleCopyImageAction();
  }, [handleCopyImageAction]);

  const handleContextMenuDownload = useCallback((): void => {
    handleDownloadImage();
  }, [handleDownloadImage]);

  const actionButtons = hasImageActions ? (
    <ImageActionButtons
      copyLabel={t("common.copyImage")}
      downloadLabel={t("common.downloadImage")}
      onCopy={handleCopyImageAction}
      onDownload={handleDownloadImage}
    />
  ) : null;

  const renderZoomContent = ({
    buttonUnzoom,
    img
  }: {
    buttonUnzoom: ReactElement<HTMLButtonElement>;
    img: ReactElement | null;
  }): JSX.Element => {
    const zoomSrc =
      isValidElement(img) &&
      typeof (img.props as { src?: unknown }).src === "string"
        ? (img.props as { src: string }).src
        : null;
    const modalDownloadName = actionButtons ? resolvedDownloadName : undefined;
    return (
      <>
        {img && zoomSrc
          ? cloneElement(img as ReactElement<ComponentPropsWithoutRef<"img">>, {
              onContextMenu:
                modalDownloadName !== undefined
                  ? handleImageContextMenu
                  : onContextMenu
            })
          : img}
        {actionButtons ? (
          <div className="tsh-zoom-dialog__image-actions nodrag tsh-desktop-no-drag">
            {actionButtons}
          </div>
        ) : null}
        {cloneElement(buttonUnzoom, {
          className: cn(
            buttonUnzoom.props.className,
            "nodrag tsh-desktop-no-drag"
          )
        })}
      </>
    );
  };

  return (
    <>
      <Zoom
        a11yNameButtonZoom={t("common.expandImage")}
        a11yNameButtonUnzoom={t("common.minimizeImage")}
        classDialog="tsh-zoom-dialog nodrag tsh-desktop-no-drag"
        isDisabled={imageContextMenu !== null}
        wrapElement={wrapElement}
        zoomMargin={24}
        ZoomContent={renderZoomContent}
      >
        <img
          {...props}
          src={src}
          onContextMenu={
            hasImageActions ? handleImageContextMenu : onContextMenu
          }
          className={cn("nodrag tsh-desktop-no-drag cursor-zoom-in", className)}
        />
      </Zoom>
      {hasImageActions && imageContextMenu ? (
        <ImageContextMenuSurface
          copyLabel={t("common.copyImage")}
          downloadLabel={t("common.downloadImage")}
          onCopy={handleContextMenuCopy}
          onDismiss={closeImageContextMenu}
          onDownload={handleContextMenuDownload}
          point={imageContextMenu.point}
          portalTarget={imageContextMenu.portalTarget}
        />
      ) : null}
      {copyStatusMessage ? (
        <div className="tsh-image-copy-status" role="status">
          {copyStatusMessage}
        </div>
      ) : null}
    </>
  );
}

function ImageContextMenuSurface({
  copyLabel,
  downloadLabel,
  onCopy,
  onDismiss,
  onDownload,
  point,
  portalTarget
}: {
  copyLabel: string;
  downloadLabel: string;
  onCopy: () => void;
  onDismiss: () => void;
  onDownload: () => void;
  point: { x: number; y: number };
  portalTarget: Element | null;
}): JSX.Element {
  const actionPendingRef = useRef(false);
  const runAction = useCallback((action: () => void): void => {
    if (actionPendingRef.current) {
      return;
    }
    actionPendingRef.current = true;
    action();
  }, []);
  const runPointerAction = useCallback(
    (event: PointerEvent<HTMLButtonElement>, action: () => void): void => {
      event.stopPropagation();
      runAction(action);
    },
    [runAction]
  );
  const runClickAction = useCallback(
    (event: SyntheticEvent<HTMLButtonElement>, action: () => void): void => {
      event.preventDefault();
      event.stopPropagation();
      runAction(action);
      onDismiss();
    },
    [onDismiss, runAction]
  );
  const stopMenuButtonEvent = useCallback(
    (event: SyntheticEvent<HTMLButtonElement>): void => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  return (
    <ViewportMenuSurface
      open
      className="min-w-[148px]"
      dismissOnEscape
      dismissOnPointerDownOutside
      dismissOnScroll
      onDismiss={onDismiss}
      placement={{
        type: "point",
        point,
        estimatedSize: { width: 148, height: 67 },
        padding: 8
      }}
      portalTarget={portalTarget}
      role="menu"
      style={{ zIndex: 100302 }}
    >
      <button
        className={cn(
          menuItemClassName,
          "w-full border-0 bg-transparent text-left"
        )}
        onClick={(event) => runClickAction(event, onCopy)}
        onMouseDown={stopMenuButtonEvent}
        onPointerDown={(event) => runPointerAction(event, onCopy)}
        onPointerUp={stopMenuButtonEvent}
        role="menuitem"
        type="button"
      >
        <span>{copyLabel}</span>
      </button>
      <button
        className={cn(
          menuItemClassName,
          "w-full border-0 bg-transparent text-left"
        )}
        onClick={(event) => runClickAction(event, onDownload)}
        onMouseDown={stopMenuButtonEvent}
        onPointerDown={(event) => runPointerAction(event, onDownload)}
        onPointerUp={stopMenuButtonEvent}
        role="menuitem"
        type="button"
      >
        <span>{downloadLabel}</span>
      </button>
    </ViewportMenuSurface>
  );
}

function ImageActionButtons({
  copyLabel,
  downloadLabel,
  itemRole,
  onCopy,
  onDownload
}: {
  copyLabel: string;
  downloadLabel: string;
  itemRole?: "menuitem";
  onCopy: () => void;
  onDownload: () => void;
}): JSX.Element {
  return (
    <>
      <button type="button" role={itemRole} title={copyLabel} onClick={onCopy}>
        <CopyIcon aria-hidden="true" className="size-4" />
        <span>{copyLabel}</span>
      </button>
      <button
        type="button"
        role={itemRole}
        title={downloadLabel}
        onClick={onDownload}
      >
        <DownloadIcon aria-hidden="true" className="size-4" />
        <span>{downloadLabel}</span>
      </button>
    </>
  );
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

function resolveImageDownloadName(
  name: string | undefined,
  src: string | null
): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const srcName = src
    ? decodeURIComponentSafe(src.split(/[?#]/, 1)[0] ?? "")
    : "";
  const lastSegment = srcName.split(/[\\/]/).pop()?.trim();
  return lastSegment || "image.png";
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
