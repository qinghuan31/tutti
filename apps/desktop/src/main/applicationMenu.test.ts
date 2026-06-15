import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationMenuTemplate } from "./applicationMenu.ts";

test("application menu exposes developer log export from Help", async () => {
  let exported = false;
  const menu = createApplicationMenuTemplate({
    exportDeveloperLogs() {
      exported = true;
    },
    platform: "darwin"
  });

  const helpMenu = menu.find((item) => item.label === "Help");
  assert.ok(helpMenu);
  assert.ok(Array.isArray(helpMenu.submenu));
  const exportItem = helpMenu.submenu.find(
    (item) => item.label === "Export Service Logs..."
  );
  assert.ok(exportItem);

  exportItem.click?.(
    {} as Parameters<NonNullable<typeof exportItem.click>>[0],
    undefined as Parameters<NonNullable<typeof exportItem.click>>[1],
    undefined as unknown as Parameters<NonNullable<typeof exportItem.click>>[2]
  );

  assert.equal(exported, true);
});

test("application menu exposes check for updates from the app menu", () => {
  let checked = false;
  const menu = createApplicationMenuTemplate({
    checkForUpdates() {
      checked = true;
    },
    platform: "darwin"
  });

  const appMenu = menu.find((item) => item.label === "Tutti");
  assert.ok(appMenu);
  assert.ok(Array.isArray(appMenu.submenu));
  const checkItem = appMenu.submenu.find(
    (item) => item.label === "Check for Updates..."
  );
  assert.ok(checkItem);

  checkItem.click?.(
    {} as Parameters<NonNullable<typeof checkItem.click>>[0],
    undefined as Parameters<NonNullable<typeof checkItem.click>>[1],
    undefined as unknown as Parameters<NonNullable<typeof checkItem.click>>[2]
  );

  assert.equal(checked, true);
});

test("application menu localizes check for updates", () => {
  const menu = createApplicationMenuTemplate({
    getLocale: () => "zh-CN",
    platform: "darwin"
  });

  const appMenu = menu.find((item) => item.label === "Tutti");
  assert.ok(appMenu);
  assert.ok(Array.isArray(appMenu.submenu));
  assert.ok(appMenu.submenu.some((item) => item.label === "检查更新..."));
});
