import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression test for a bug where AgentGUINode's onShowMessage callback (used
// e.g. to tell the user a Codex permission-mode change will only apply
// starting with their next message, see
// useAgentGUINodeController's "messages.agentPermissionModeAppliesNextTurn"
// path) was wired to a no-op on desktop, so the message was computed and
// handed to the callback but never actually shown to the user anywhere.
const workbenchBodySource = readFileSync(
  new URL("./DesktopAgentGUIWorkbenchBody.tsx", import.meta.url),
  "utf8"
);
const manageDialogSource = readFileSync(
  new URL("./DesktopAgentProviderManageDialog.tsx", import.meta.url),
  "utf8"
);
const envWizardSource = readFileSync(
  new URL("./useAgentEnvWizard.ts", import.meta.url),
  "utf8"
);

test("desktop AgentGUI onShowMessage is wired to a real toast, not the shared no-op", () => {
  assert.doesNotMatch(
    workbenchBodySource,
    /onShowMessage=\{DESKTOP_AGENT_GUI_NOOP\}/
  );
  assert.match(
    workbenchBodySource,
    /onShowMessage=\{handleDesktopAgentGUIShowMessage\}/
  );
});

test("handleDesktopAgentGUIShowMessage routes error tone to Toast.Error and other tones to Toast.tips", () => {
  assert.match(
    workbenchBodySource,
    /function handleDesktopAgentGUIShowMessage\([^)]*message: string,[^)]*tone\?: "info" \| "warning" \| "error",?[^)]*\): void \{[\s\S]*if \(tone === "error"\) \{[\s\S]*Toast\.Error\(message\);[\s\S]*return;[\s\S]*\}[\s\S]*Toast\.tips\(message\);[\s\S]*\}/
  );
});

test("desktop Tutti Agent login CTAs use account login instead of provider terminal login", () => {
  assert.match(
    workbenchBodySource,
    /if \(loginProvider === "tutti-agent"\) \{\s*void accountService\.startLogin\(\);\s*return;\s*\}/
  );
  assert.match(
    workbenchBodySource,
    /if \(actionProvider === "tutti-agent" && action === "login"\) \{\s*void accountService\.startLogin\(\);\s*return;\s*\}/
  );
  assert.match(
    manageDialogSource,
    /if \(row\.provider === "tutti-agent" && row\.primaryActionId === "login"\) \{\s*await accountService\.startLogin\(\);\s*\} else \{/
  );
  assert.match(
    envWizardSource,
    /if \(provider === "tutti-agent" && actionId === "login"\) \{\s*await accountService\.startLogin\(\);\s*return;\s*\}/
  );
  assert.match(
    workbenchBodySource,
    /previousLoginStatus === "completed"[\s\S]*accountState\.loginStatus === "completed"[\s\S]*previousUserId !== accountUserId[\s\S]*agentProviderStatusService\?\.refresh\(\["tutti-agent"\]\)/
  );
});
