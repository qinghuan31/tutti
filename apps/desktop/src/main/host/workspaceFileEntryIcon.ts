import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  resolveWorkspaceFileDefaultApplicationIconExtension,
  resolveWorkspaceFileVisualKind
} from "@tutti-os/workspace-file-manager/services";
import {
  readApplicationIconDataUrl,
  resolveDefaultApplicationForFile
} from "./openWithApplications.ts";
import type { WorkspaceFileIconCacheStore } from "./workspaceFileIconCacheStore.ts";

const entryIconPixelSize = 64;
const imageThumbnailPixelSize = 160;
const imageThumbnailMaxSourceBytes = 20 * 1024 * 1024;

type WorkspaceFileEntryIconStat = {
  isFile(): boolean;
  size: number;
};

type WorkspaceFileEntryIconStatReader = (
  targetPath: string
) => Promise<WorkspaceFileEntryIconStat>;

export interface WorkspaceFileEntryIconInput {
  kind: string;
  mtimeMs: number | null;
  name: string;
  path: string;
  workspaceID: string;
}

interface WorkspaceFileEntryIconResolverDependencies {
  readApplicationIconDataUrl?: typeof readApplicationIconDataUrl;
  readImageThumbnailPngBytes?: typeof readImageThumbnailPngBytes;
  readNativeFileIconPngBytes?: typeof readNativeFileIconPngBytes;
  resolveDefaultApplicationForFile?: typeof resolveDefaultApplicationForFile;
  stat?: WorkspaceFileEntryIconStatReader;
}

export async function resolveWorkspaceFileEntryIconUrl(
  targetPath: string,
  entry: WorkspaceFileEntryIconInput,
  cacheStore: WorkspaceFileIconCacheStore,
  dependencies: WorkspaceFileEntryIconResolverDependencies = {}
): Promise<string | null> {
  if (isImageThumbnailEntry(entry)) {
    return resolveImageThumbnailIconUrl(
      targetPath,
      entry,
      cacheStore,
      dependencies
    );
  }

  if (isApplicationBundleEntry(entry)) {
    return resolveApplicationBundleIconUrl(
      targetPath,
      entry,
      cacheStore,
      dependencies
    );
  }

  return resolveFileTypeDefaultApplicationIconUrl(
    targetPath,
    entry,
    cacheStore,
    dependencies
  );
}

async function resolveImageThumbnailIconUrl(
  targetPath: string,
  entry: WorkspaceFileEntryIconInput,
  cacheStore: WorkspaceFileIconCacheStore,
  dependencies: WorkspaceFileEntryIconResolverDependencies
): Promise<string | null> {
  const cacheKey = {
    assetKind: "image-thumbnail" as const,
    mtimeMs: entry.mtimeMs,
    path: entry.path,
    sizePx: imageThumbnailPixelSize,
    workspaceID: entry.workspaceID
  };
  const cachedUrl = await cacheStore.readUrl(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  let sourceStats: WorkspaceFileEntryIconStat;
  try {
    sourceStats = await (dependencies.stat ?? statFile)(targetPath);
  } catch {
    return null;
  }
  if (
    !sourceStats.isFile() ||
    sourceStats.size <= 0 ||
    sourceStats.size > imageThumbnailMaxSourceBytes
  ) {
    return null;
  }

  const thumbnailBytes = await (
    dependencies.readImageThumbnailPngBytes ?? readImageThumbnailPngBytes
  )(targetPath, imageThumbnailPixelSize);
  if (!thumbnailBytes) {
    return pathToFileURL(targetPath).href;
  }

  const cachedThumbnailUrl = await cacheStore.write({
    bytes: thumbnailBytes,
    key: cacheKey,
    mimeType: "image/png"
  });

  return cachedThumbnailUrl ?? pathToFileURL(targetPath).href;
}

async function statFile(
  targetPath: string
): Promise<WorkspaceFileEntryIconStat> {
  return stat(targetPath);
}

async function resolveApplicationBundleIconUrl(
  targetPath: string,
  entry: WorkspaceFileEntryIconInput,
  cacheStore: WorkspaceFileIconCacheStore,
  dependencies: WorkspaceFileEntryIconResolverDependencies
): Promise<string | null> {
  const cacheKey = {
    assetKind: "application-icon" as const,
    mtimeMs: entry.mtimeMs,
    path: entry.path,
    workspaceID: entry.workspaceID
  };
  const cachedUrl = await cacheStore.readUrl(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  const nativeIcon = await (
    dependencies.readNativeFileIconPngBytes ?? readNativeFileIconPngBytes
  )(targetPath);
  const iconBytes =
    nativeIcon ??
    dataUrlToPngBytes(
      await (
        dependencies.readApplicationIconDataUrl ?? readApplicationIconDataUrl
      )(targetPath, entry.name)
    );
  if (!iconBytes) {
    return null;
  }

  return cacheStore.write({
    bytes: iconBytes,
    key: cacheKey,
    mimeType: "image/png"
  });
}

async function resolveFileTypeDefaultApplicationIconUrl(
  targetPath: string,
  entry: WorkspaceFileEntryIconInput,
  cacheStore: WorkspaceFileIconCacheStore,
  dependencies: WorkspaceFileEntryIconResolverDependencies
): Promise<string | null> {
  const fileExtension =
    resolveWorkspaceFileDefaultApplicationIconExtension(entry);
  if (!fileExtension) {
    return null;
  }

  const defaultApplication = await (
    dependencies.resolveDefaultApplicationForFile ??
    resolveDefaultApplicationForFile
  )(targetPath);
  if (!defaultApplication) {
    return null;
  }

  const cacheKey = {
    applicationPath: defaultApplication.applicationPath,
    assetKind: "file-type-default-application-icon" as const,
    fileExtension,
    platform: "darwin" as const
  };
  const cachedUrl = await cacheStore.readUrl(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  const iconBytes = dataUrlToPngBytes(
    await (
      dependencies.readApplicationIconDataUrl ?? readApplicationIconDataUrl
    )(defaultApplication.applicationPath, defaultApplication.name)
  );
  if (!iconBytes) {
    return null;
  }

  return cacheStore.write({
    bytes: iconBytes,
    key: cacheKey,
    mimeType: "image/png"
  });
}

function isApplicationBundleEntry(
  entry: Pick<WorkspaceFileEntryIconInput, "kind" | "name">
): boolean {
  return entry.kind !== "file" && isApplicationBundleName(entry.name);
}

function isImageThumbnailEntry(
  entry: Pick<WorkspaceFileEntryIconInput, "kind" | "name" | "path">
): boolean {
  return (
    entry.kind === "file" && resolveWorkspaceFileVisualKind(entry) === "image"
  );
}

export function isApplicationBundleName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".app");
}

export function isMacOSApplicationBundle(
  entry: Pick<WorkspaceFileEntryIconInput, "kind" | "name">,
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === "darwin" && isApplicationBundleEntry(entry);
}

function dataUrlToPngBytes(dataUrl: string | null): Buffer | null {
  if (!dataUrl) {
    return null;
  }

  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  const encodedBytes = match?.[1];
  if (!encodedBytes) {
    return null;
  }

  const bytes = Buffer.from(encodedBytes, "base64");
  return bytes.byteLength > 0 ? bytes : null;
}

async function readNativeFileIconPngBytes(
  targetPath: string
): Promise<Buffer | null> {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return null;
  }

  try {
    const { app } = await import("electron");
    const icon = await app.getFileIcon(targetPath, { size: "large" });
    if (icon.isEmpty()) {
      return null;
    }
    return icon
      .resize({ height: entryIconPixelSize, width: entryIconPixelSize })
      .toPNG();
  } catch {
    return null;
  }
}

async function readImageThumbnailPngBytes(
  targetPath: string,
  maxEdgePx: number
): Promise<Buffer | null> {
  try {
    const { nativeImage } = await import("electron");
    let image = nativeImage.createFromPath(targetPath);
    if (image.isEmpty()) {
      image = nativeImage.createFromBuffer(await readFile(targetPath));
    }
    if (image.isEmpty()) {
      return null;
    }

    const sourceSize = image.getSize();
    if (!isValidImageSize(sourceSize)) {
      return null;
    }

    const scale = Math.min(
      1,
      maxEdgePx / Math.max(sourceSize.width, sourceSize.height)
    );
    const output =
      scale < 1
        ? image.resize({
            height: Math.max(1, Math.round(sourceSize.height * scale)),
            width: Math.max(1, Math.round(sourceSize.width * scale))
          })
        : image;
    if (output.isEmpty()) {
      return null;
    }
    return output.toPNG();
  } catch {
    return null;
  }
}

function isValidImageSize(size: { height: number; width: number }): boolean {
  return (
    Number.isFinite(size.height) &&
    Number.isFinite(size.width) &&
    size.height > 0 &&
    size.width > 0
  );
}
