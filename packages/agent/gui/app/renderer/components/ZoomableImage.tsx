import {
  cloneElement,
  type ComponentPropsWithoutRef,
  type JSX,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { CopyIcon, DownloadIcon } from "lucide-react";
import Zoom from "react-medium-image-zoom";
import { useTranslation } from "../../../i18n/index";
import { cn } from "../lib/utils";

interface ZoomableImageProps extends ComponentPropsWithoutRef<"img"> {
  downloadName?: string;
  wrapElement?: "div" | "span";
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
  const actionSource =
    typeof src === "string" && src.trim() ? src.trim() : null;
  const resolvedDownloadName = useMemo(
    () => resolveImageDownloadName(downloadName, actionSource),
    [actionSource, downloadName]
  );
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!contextMenuPosition) {
      return;
    }

    document.addEventListener("click", closeContextMenu);
    document.addEventListener("scroll", closeContextMenu, true);
    return () => {
      document.removeEventListener("click", closeContextMenu);
      document.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [closeContextMenu, contextMenuPosition]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLImageElement>): void => {
      onContextMenu?.(event);
      if (event.defaultPrevented || !actionSource) {
        return;
      }
      event.preventDefault();
      setContextMenuPosition({ x: event.clientX, y: event.clientY });
    },
    [actionSource, onContextMenu]
  );

  const handleCopyImage = useCallback(async (): Promise<void> => {
    if (!actionSource) {
      return;
    }
    closeContextMenu();
    await copyImageToClipboard(actionSource);
  }, [actionSource, closeContextMenu]);

  const handleCopyImageAction = useCallback((): void => {
    void handleCopyImage().catch(() => undefined);
  }, [handleCopyImage]);

  const handleDownloadImage = useCallback((): void => {
    if (!actionSource) {
      return;
    }
    closeContextMenu();
    downloadImage(actionSource, resolvedDownloadName);
  }, [actionSource, closeContextMenu, resolvedDownloadName]);

  const actionButtons = actionSource ? (
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
  }): JSX.Element => (
    <>
      {img}
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

  return (
    <>
      <Zoom
        a11yNameButtonZoom={t("common.expandImage")}
        a11yNameButtonUnzoom={t("common.minimizeImage")}
        classDialog="tsh-zoom-dialog nodrag tsh-desktop-no-drag"
        wrapElement={wrapElement}
        zoomMargin={24}
        ZoomContent={renderZoomContent}
      >
        <img
          {...props}
          src={src}
          onContextMenu={handleContextMenu}
          className={cn("nodrag tsh-desktop-no-drag cursor-zoom-in", className)}
        />
      </Zoom>
      {contextMenuPosition && actionButtons ? (
        <div
          className="tsh-image-context-menu nodrag tsh-desktop-no-drag"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y
          }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <ImageActionButtons
            copyLabel={t("common.copyImage")}
            downloadLabel={t("common.downloadImage")}
            itemRole="menuitem"
            onCopy={handleCopyImageAction}
            onDownload={handleDownloadImage}
          />
        </div>
      ) : null}
    </>
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

async function copyImageToClipboard(src: string): Promise<void> {
  const clipboard = navigator.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (
    !clipboard ||
    typeof clipboard.write !== "function" ||
    typeof ClipboardItemConstructor !== "function"
  ) {
    return;
  }

  const blob = await loadImageBlob(src);
  await clipboard.write([
    new ClipboardItemConstructor({
      [blob.type || "image/png"]: blob
    })
  ]);
}

async function loadImageBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  const blob = await response.blob();
  if (blob.type) {
    return blob;
  }
  return new Blob([await blob.arrayBuffer()], { type: "image/png" });
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
