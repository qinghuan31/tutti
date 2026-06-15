import assert from "node:assert/strict";
import test from "node:test";
import { createAppUpdateService } from "./appUpdateService.ts";

test("createAppUpdateService can enable dev updates with an injected current version", async () => {
  const env = withAppUpdateEnv({
    TUTTI_APP_UPDATE_CURRENT_VERSION: "0.2.0-rc.0",
    TUTTI_APP_UPDATE_DEV: "1"
  });
  const driver = createFakeDriver();

  try {
    const service = createAppUpdateService(driver, {
      supportsUpdates: undefined
    });
    const state = await service.configure({
      channel: "rc",
      policy: "auto"
    });

    assert.equal(state.currentVersion, "0.2.0-rc.0");
    assert.equal(state.status, "idle");
    assert.deepEqual(driver.configureCalls, [
      {
        allowPrerelease: true,
        autoDownload: true,
        autoInstallOnAppQuit: true,
        channel: "rc",
        forceDevUpdateConfig: true
      }
    ]);
    service.dispose();
  } finally {
    env.restore();
  }
});

test("createAppUpdateService can simulate a dev prerelease update", async () => {
  const env = withAppUpdateEnv({
    TUTTI_APP_UPDATE_CURRENT_VERSION: "0.2.0-rc.0",
    TUTTI_APP_UPDATE_DEV: "1",
    TUTTI_APP_UPDATE_LATEST_VERSION: "0.2.0-rc.1",
    TUTTI_APP_UPDATE_MOCK: "available"
  });

  try {
    const service = createAppUpdateService();
    await service.configure({
      channel: "rc",
      policy: "prompt"
    });
    const state = await service.checkForUpdates();

    assert.equal(state.currentVersion, "0.2.0-rc.0");
    assert.equal(state.latestVersion, "0.2.0-rc.1");
    assert.equal(state.status, "available");
    service.dispose();
  } finally {
    env.restore();
  }
});

function withAppUpdateEnv(values: Record<string, string>): {
  restore(): void;
} {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return {
    restore() {
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  };
}

type DriverConfigureCall = {
  allowPrerelease: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  channel: string;
  forceDevUpdateConfig: boolean;
};

function createFakeDriver(): Parameters<typeof createAppUpdateService>[0] & {
  configureCalls: DriverConfigureCall[];
} {
  const configureCalls: DriverConfigureCall[] = [];
  return {
    configureCalls,
    checkForUpdates: () => Promise.resolve(),
    configure(options) {
      configureCalls.push(options);
    },
    downloadUpdate: () => Promise.resolve(),
    onCheckingForUpdate: () => noop,
    onDownloadProgress: () => noop,
    onError: () => noop,
    onUpdateAvailable: () => noop,
    onUpdateDownloaded: () => noop,
    onUpdateNotAvailable: () => noop,
    quitAndInstall() {}
  };
}

function noop() {}
