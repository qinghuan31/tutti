import type { WorkspaceLaunchOwnerWindow } from "./workspaceLaunch.ts";

export interface DesktopWindowAccess {
  approveClose(ownerWindow?: WorkspaceLaunchOwnerWindow | null): Promise<void>;
}

export interface DesktopWindowFillTarget {
  isFullScreen(): boolean;
  isMaximized(): boolean;
  maximize(): void;
  setFullScreen(fullscreen: boolean): void;
  unmaximize(): void;
}

export function createDesktopWindowAccess(): DesktopWindowAccess {
  return {
    approveClose(ownerWindow) {
      forceDestroyWindow(ownerWindow);
      return Promise.resolve();
    }
  };
}

export function toggleDesktopWindowFillState(
  ownerWindow: DesktopWindowFillTarget,
  platform: NodeJS.Platform
): void {
  if (platform === "win32") {
    if (ownerWindow.isMaximized()) {
      ownerWindow.unmaximize();
    } else {
      ownerWindow.maximize();
    }
    return;
  }

  ownerWindow.setFullScreen(!ownerWindow.isFullScreen());
}

function forceDestroyWindow(
  ownerWindow?: WorkspaceLaunchOwnerWindow | null
): void {
  if (!ownerWindow) {
    return;
  }

  if (typeof ownerWindow.destroy === "function") {
    ownerWindow.destroy();
    return;
  }

  ownerWindow.close();
}
