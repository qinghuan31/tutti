export interface WorkspaceFilesLaunchRequest {
  homeDirectory?: string | null;
  mode?: WorkspaceFilesLaunchMode;
  path: string;
  source?: "agent_command" | "issue_manager";
  workspaceId: string;
}

export type WorkspaceFilesLaunchMode = "reveal" | "open-directory";

export const workspaceFilesLaunchTypeId = "workspace-files";

export type WorkspaceFilesLaunchHandler = (
  request: WorkspaceFilesLaunchRequest
) => Promise<boolean> | boolean;

const launchHandlersByWorkspaceId = new Map<
  string,
  WorkspaceFilesLaunchHandler
>();

export function registerWorkspaceFilesLaunchHandler(
  workspaceId: string,
  handler: WorkspaceFilesLaunchHandler
): () => void {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    return noop;
  }

  launchHandlersByWorkspaceId.set(normalizedWorkspaceId, handler);
  return () => {
    if (launchHandlersByWorkspaceId.get(normalizedWorkspaceId) === handler) {
      launchHandlersByWorkspaceId.delete(normalizedWorkspaceId);
    }
  };
}

export async function requestWorkspaceFilesLaunch(
  request: WorkspaceFilesLaunchRequest
): Promise<boolean> {
  const normalizedWorkspaceId = request.workspaceId.trim();
  const normalizedPath = normalizeWorkspaceFilesLaunchPath({
    homeDirectory: request.homeDirectory,
    path: request.path
  });
  if (!normalizedWorkspaceId || !normalizedPath) {
    return false;
  }

  const handler = launchHandlersByWorkspaceId.get(normalizedWorkspaceId);
  if (!handler) {
    return false;
  }

  return handler({
    ...(request.mode ? { mode: request.mode } : {}),
    path: normalizedPath,
    ...(request.source ? { source: request.source } : {}),
    workspaceId: normalizedWorkspaceId
  });
}

function normalizeWorkspaceFilesLaunchPath(input: {
  homeDirectory?: string | null;
  path: string;
}): string | null {
  const normalized = normalizeLocalPath(input.path);
  if (!normalized) {
    return null;
  }
  const homeRelative = homeRelativeAbsolutePath({
    homeDirectory: input.homeDirectory,
    path: normalized
  });
  if (homeRelative !== null) {
    return normalized;
  }
  if (isAbsoluteLocalPath(normalized)) {
    return null;
  }
  return normalized;
}

function homeRelativeAbsolutePath(input: {
  homeDirectory?: string | null;
  path: string;
}): string | null {
  const homeDirectory = normalizeLocalPath(input.homeDirectory ?? "");
  if (!homeDirectory) {
    return null;
  }

  const comparison = isWindowsAbsolutePath(homeDirectory)
    ? {
        homeDirectory: homeDirectory.toLowerCase(),
        path: input.path.toLowerCase()
      }
    : {
        homeDirectory,
        path: input.path
      };
  if (comparison.path === comparison.homeDirectory) {
    return "";
  }
  if (!comparison.path.startsWith(`${comparison.homeDirectory}/`)) {
    return null;
  }
  return input.path.slice(homeDirectory.length + 1);
}

function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith("/") || isWindowsAbsolutePath(path);
}

function isWindowsAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:\//.test(path);
}

function normalizeLocalPath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/\/+$/, "");
}

function noop(): void {}
