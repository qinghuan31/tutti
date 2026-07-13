import assert from "node:assert/strict";
import test from "node:test";
import {
  createDesktopWindowAccess,
  toggleDesktopWindowFillState
} from "./desktopWindowAccess.ts";
import type { WorkspaceLaunchOwnerWindow } from "./workspaceLaunch.ts";

test("desktop window access approves close by closing the current owner window", async () => {
  const events: string[] = [];
  const ownerWindow: WorkspaceLaunchOwnerWindow = {
    close() {
      events.push("owner:closed");
    }
  };

  await createDesktopWindowAccess().approveClose(ownerWindow);

  assert.deepEqual(events, ["owner:closed"]);
});

test("desktop window access prefers destroy after close is approved", async () => {
  const events: string[] = [];
  const ownerWindow: WorkspaceLaunchOwnerWindow = {
    close() {
      events.push("owner:closed");
    },
    destroy() {
      events.push("owner:destroyed");
    }
  };

  await createDesktopWindowAccess().approveClose(ownerWindow);

  assert.deepEqual(events, ["owner:destroyed"]);
});

test("desktop window access toggles maximize on Windows", () => {
  const events: string[] = [];
  let maximized = false;
  const ownerWindow = {
    isFullScreen: () => false,
    isMaximized: () => maximized,
    maximize() {
      maximized = true;
      events.push("maximize");
    },
    setFullScreen() {},
    unmaximize() {
      maximized = false;
      events.push("unmaximize");
    }
  };

  toggleDesktopWindowFillState(ownerWindow, "win32");
  toggleDesktopWindowFillState(ownerWindow, "win32");

  assert.deepEqual(events, ["maximize", "unmaximize"]);
});

test("desktop window access toggles fullscreen outside Windows", () => {
  const events: boolean[] = [];
  let fullscreen = false;
  const ownerWindow = {
    isFullScreen: () => fullscreen,
    isMaximized: () => false,
    maximize() {},
    setFullScreen(next: boolean) {
      fullscreen = next;
      events.push(next);
    },
    unmaximize() {}
  };

  toggleDesktopWindowFillState(ownerWindow, "darwin");
  toggleDesktopWindowFillState(ownerWindow, "darwin");

  assert.deepEqual(events, [true, false]);
});
