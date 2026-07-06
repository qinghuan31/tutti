import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(
    "src/renderer/src/features/workspace-workbench/ui/WorkspaceWorkbench.tsx"
  ),
  "utf8"
);
const agentGuiContributionSource = readFileSync(
  resolve(
    "src/renderer/src/features/workspace-workbench/services/internal/workspaceAgentGuiContribution.ts"
  ),
  "utf8"
);
const launchpadOverlaySource = readFileSync(
  resolve(
    "src/renderer/src/features/workspace-workbench/ui/WorkspaceLaunchpadOverlay.tsx"
  ),
  "utf8"
);
const shellRuntimeSource = readFileSync(
  resolve(
    "src/renderer/src/features/workspace-workbench/ui/useWorkspaceWorkbenchShellRuntime.tsx"
  ),
  "utf8"
);

test("WorkspaceWorkbench does not render a global agent install pending overlay", () => {
  assert.doesNotMatch(source, /WorkspaceAgentConnectingCard/);
  assert.doesNotMatch(
    source,
    /pendingActions\.find\(\s*\(action\) => action\.actionId === "install"/s
  );
});

test("WorkspaceWorkbench forwards open-directory mode to workspace files", () => {
  assert.match(
    source,
    /payload:\s*\{\s*\.\.\.\(request\.mode \? \{ mode: request\.mode \} : \{\}\),\s*path: request\.path\s*\}/s
  );
});

test("WorkspaceWorkbench validates requested file targets before opening workspace files", () => {
  assert.match(
    source,
    /request\.validateExists[\s\S]*workspaceFileManagerService\.entryExists\(\{[\s\S]*path: request\.path[\s\S]*workspaceID: request\.workspaceId[\s\S]*return false;[\s\S]*host\.launchNode/s
  );
});

test("WorkspaceWorkbench surfaces a toast instead of silently no-op'ing when a requested file target doesn't exist", () => {
  // Regression coverage for imported (historical Codex/Claude Code) sessions
  // whose recorded working directory may no longer exist on this machine —
  // previously, opening the Files panel for such a session (via a file link
  // or the project menu's "Open folder" action) silently did nothing with no
  // user-facing feedback at all.
  assert.match(
    source,
    /workspaceID: request\.workspaceId[\s\S]*?\}\)\)\s*\)\s*\{[\s\S]*?Toast\.Error\(\s*translate\(\s*"workspace\.workbenchDesktop\.filesLaunch\.openFailedTitle"\s*\),\s*translate\(\s*"workspace\.workbenchDesktop\.filesLaunch\.openFailedDescription"\s*\)\s*\);\s*return false;/
  );
});

test("WorkspaceWorkbench uses temporary dock retention to control app visibility", () => {
  assert.match(source, /temporaryWorkspaceAppDockRetentionActionPrefix/);
  assert.match(source, /resolveTemporaryDockRetentionContribution/);
  assert.match(
    source,
    /contribution\.dockEntries\.map\(\(entry\) =>\s*resolveTemporaryDockRetentionEntry/
  );
  assert.match(source, /findTemporaryDockRetentionEntry/);
  assert.match(source, /entry\.id === workspaceLaunchpadDockEntryId/);
  assert.match(source, /entry\.id === workspaceFilesNodeID/);
  assert.match(
    source,
    /actionId:\s*`\$\{temporaryWorkspaceAppDockRetentionActionPrefix\}\$\{encodeURIComponent\(entry\.id\)\}`/
  );
  assert.match(
    source,
    /return app\?\.installed \?\? \(entry\.visibility \?\? "always"\) === "always";/
  );
  assert.match(source, /visibility:\s*retained \? "always" : "when-open"/);
});

test("WorkspaceWorkbench opens manage agents dialog from agent-manage feature request", () => {
  assert.match(source, /DesktopAgentProviderManageDialog/);
  assert.match(source, /request\.feature === "agent-manage"/);
  assert.match(source, /setAgentProviderManageDialogOpen\(true\)/);
  assert.match(
    source,
    /setAgentProviderManageFocusedProvider\(\s*isDesktopAgentGUIProvider\(request\.provider\) \? request\.provider : null\s*\)/s
  );
});

test("agent gui rail external action opens an internal agent session window", () => {
  assert.match(
    agentGuiContributionSource,
    /onOpenAgentConversationWindow:\s*async \(request\) => \{\s*await requestWorkspaceAgentGuiLaunch\(\{\s*\.\.\.request,\s*openInNewWindow: true\s*\}\);[\s\S]*?\}/
  );
});

test("agent gui dock visibility ignores disabled Tutti Agent targets", () => {
  assert.match(
    agentGuiContributionSource,
    /target\.provider === provider && target\.disabled !== true/
  );
});

test("WorkspaceLaunchpad renders one generic Agent entry", () => {
  assert.doesNotMatch(source, /agentDockLayout=\{runtime\.agentDockLayout\}/);
  assert.match(
    launchpadOverlaySource,
    /return \[[\s\S]*iconUrl: input\.launchpadDockIcons\.agentUnified[\s\S]*id: "agent:unified"[\s\S]*\];/
  );
  assert.doesNotMatch(
    launchpadOverlaySource,
    /workspaceAgentGuiProviders\.map\(\(provider\) =>\s*resolveLaunchpadAgentDescriptor/
  );
});

test("launchpad excludes settings-disabled Tutti Agent from unified provider resolution", () => {
  assert.match(
    launchpadOverlaySource,
    /workspaceSettingsState\.tuttiAgentSwitchEnabled !== true[\s\S]*hidden\.push\("tutti-agent"\)/
  );
  assert.doesNotMatch(launchpadOverlaySource, /disabledBySettings/);
});

test("workspace shell loads AgentGUI provider targets while preserving static catalog for empty loads", () => {
  assert.match(shellRuntimeSource, /loadAgentGuiProviderTargets/);
  assert.match(
    shellRuntimeSource,
    /const targets =[\s\S]*agentGuiProviderTargets && agentGuiProviderTargets\.length > 0[\s\S]*\? agentGuiProviderTargets[\s\S]*: undefined/s
  );
  assert.doesNotMatch(
    shellRuntimeSource,
    /const resolvedAgentGuiProviderTargets = useMemo\(\s*\(\) => agentGuiProviderTargets \?\? \[\]/s
  );
});
