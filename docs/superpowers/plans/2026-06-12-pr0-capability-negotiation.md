# PR0 能力協商底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立「daemon 運行時上報為主、靜態預設兜底」的 provider 能力協商機制，統一能力詞表，並以行為不變的方式遷移 image 與 compact 兩個門控站點。

**Architecture:** adapter 在 SessionState 快照中上報 `runtimeContext.capabilities`（string 列表）；nextopd `GetComposerOptions` 提供每 provider 的靜態保守預設（會話建立前兜底）；GUI 在 activity-core 增加 `resolveAgentActivityCapability(key, input)`（運行時優先、composer options 兜底、imageInput 帶 legacy promptCapabilities 回退），slash 命令策略接入 compact 能力門控。planMode 能力本 PR 只「上報+可消費」，不改任何 UI 旗標（`composerSupportForProvider.plan=false` 是產品決策而非能力缺失，遷移它會引入行為變化，留給 PR3 按需消費）。

**Tech Stack:** Go（packages/agent/daemon、services/nextopd）、TypeScript（packages/agent/activity-core 用 node:test、packages/agent/gui 用 vitest）。

**分支策略:** 基於 `codex-app-server` 分支新建 `capability-negotiation`（stacked：codex capabilities 上報只存在於該分支）。

**統一能力詞表（spec §4）:** `imageInput` `skills` `compact` `tokenUsage` `rateLimits` `planMode` `interrupt`（codex 另有超出詞表的擴展 key：steer/review/rollback/fork/perTurnModelOverride，保留不動）。

---

### Task 0: 建立分支

- [x] **Step 1: 確認基線並建分支**

```bash
cd /Users/riceballpapa/Repo/nextop
git checkout codex-app-server && git pull --ff-only 2>/dev/null; git checkout -b capability-negotiation
```

Expected: `Switched to a new branch 'capability-negotiation'`

### Task 1: Go 能力詞表常量 + codex 對齊

**Files:**

- Create: `packages/agent/daemon/runtime/capabilities.go`
- Modify: `packages/agent/daemon/runtime/codex_appserver_events.go`（`codexAppServerCapabilities()`，約 :1080 附近）
- Test: `packages/agent/daemon/runtime/capabilities_test.go`

- [x] **Step 1: 寫失敗測試**

```go
package agentruntime

import "testing"

func TestCodexAppServerCapabilitiesUseSharedVocabulary(t *testing.T) {
	t.Parallel()
	capabilities := codexAppServerCapabilities()
	for _, want := range []string{
		CapabilityImageInput,
		CapabilitySkills,
		CapabilityCompact,
		CapabilityTokenUsage,
		CapabilityRateLimits,
		CapabilityInterrupt,
	} {
		if !containsString(capabilities, want) {
			t.Fatalf("codex capabilities = %v, missing %q", capabilities, want)
		}
	}
	if containsString(capabilities, CapabilityPlanMode) {
		t.Fatalf("codex must not advertise planMode")
	}
}
```

注意：`containsString` 已存在於 `codex_adapter_test.go`，測試包內直接可用。

- [x] **Step 2: 跑測試確認失敗**

Run: `cd packages/agent/daemon && go test ./runtime/ -run TestCodexAppServerCapabilitiesUseSharedVocabulary -count=1`
Expected: FAIL（`undefined: CapabilityImageInput`）

- [x] **Step 3: 實現詞表常量並改造 codex 列表**

`capabilities.go`：

```go
package agentruntime

// Canonical provider capability keys shared by all adapters and surfaced to
// the GUI through runtimeContext.capabilities. Keep in sync with the
// TypeScript side (packages/agent/activity-core/src/capabilities.ts).
const (
	CapabilityImageInput = "imageInput"
	CapabilitySkills     = "skills"
	CapabilityCompact    = "compact"
	CapabilityTokenUsage = "tokenUsage"
	CapabilityRateLimits = "rateLimits"
	CapabilityPlanMode   = "planMode"
	CapabilityInterrupt  = "interrupt"
)
```

`codex_appserver_events.go` 的 `codexAppServerCapabilities()` 改為：

```go
func codexAppServerCapabilities() []string {
	return []string{
		CapabilityImageInput,
		CapabilitySkills,
		CapabilityInterrupt,
		CapabilityCompact,
		CapabilityRateLimits,
		CapabilityTokenUsage,
		"steer",
		"review",
		"rollback",
		"fork",
		"perTurnModelOverride",
	}
}
```

- [x] **Step 4: 跑測試確認通過**

Run: `go test ./runtime/ -run "TestCodexAppServerCapabilities" -count=1`
Expected: PASS（含既有 SessionState 相關測試——若 `TestCodexAppServerAdapterSessionStateIncludesModelsAccountAndRateLimits` 斷言 capabilities 內容,同步其期望值）

- [x] **Step 5: Commit**

```bash
git add packages/agent/daemon/runtime/capabilities.go packages/agent/daemon/runtime/codex_appserver_events.go packages/agent/daemon/runtime/capabilities_test.go
git commit -m "feat(agent): shared capability vocabulary, align codex list"
```

### Task 2: StandardACPAdapter 上報 capabilities

**Files:**

- Modify: `packages/agent/daemon/runtime/capabilities.go`（追加派生函數）
- Modify: `packages/agent/daemon/runtime/standard_acp_adapter.go`（`SessionState` 內 usage 上報處附近，約 :1282）
- Test: `packages/agent/daemon/runtime/capabilities_test.go`

- [x] **Step 1: 寫失敗測試**

```go
func TestStandardACPCapabilitiesByProvider(t *testing.T) {
	t.Parallel()
	claude := standardACPCapabilities(ProviderClaudeCode, true, acpLiveStateSnapshot{})
	for _, want := range []string{
		CapabilityImageInput, CapabilitySkills, CapabilityCompact,
		CapabilityTokenUsage, CapabilityRateLimits, CapabilityPlanMode, CapabilityInterrupt,
	} {
		if !containsString(claude, want) {
			t.Fatalf("claude capabilities = %v, missing %q", claude, want)
		}
	}

	// 其他 ACP provider：保守派生——interrupt 恆有；imageInput 跟隨 promptImage；
	// compact 僅在 availableCommands 出現 compact 時亮起；無 skills/planMode。
	gemini := standardACPCapabilities(ProviderGemini, false, acpLiveStateSnapshot{})
	if containsString(gemini, CapabilityImageInput) ||
		containsString(gemini, CapabilityCompact) ||
		containsString(gemini, CapabilitySkills) ||
		containsString(gemini, CapabilityPlanMode) {
		t.Fatalf("gemini capabilities too permissive: %v", gemini)
	}
	if !containsString(gemini, CapabilityInterrupt) {
		t.Fatalf("gemini capabilities missing interrupt: %v", gemini)
	}

	withCompact := standardACPCapabilities(ProviderGemini, true, acpLiveStateSnapshot{
		availableCommands: []AgentSessionCommand{{Name: "compact"}},
	})
	if !containsString(withCompact, CapabilityCompact) || !containsString(withCompact, CapabilityImageInput) {
		t.Fatalf("derived capabilities = %v, want compact+imageInput", withCompact)
	}
}
```

- [x] **Step 2: 跑測試確認失敗**

Run: `go test ./runtime/ -run TestStandardACPCapabilitiesByProvider -count=1`
Expected: FAIL（`undefined: standardACPCapabilities`）

- [x] **Step 3: 實現派生函數（追加到 capabilities.go）**

```go
// standardACPCapabilities derives the canonical capability list for ACP
// family providers. claude-code has a known full surface; other providers
// are derived conservatively from the live session state.
func standardACPCapabilities(provider string, promptImage bool, state acpLiveStateSnapshot) []string {
	if provider == ProviderClaudeCode {
		capabilities := []string{
			CapabilitySkills,
			CapabilityCompact,
			CapabilityTokenUsage,
			CapabilityRateLimits,
			CapabilityPlanMode,
			CapabilityInterrupt,
		}
		if promptImage {
			capabilities = append([]string{CapabilityImageInput}, capabilities...)
		}
		return capabilities
	}
	capabilities := []string{CapabilityInterrupt}
	if promptImage {
		capabilities = append(capabilities, CapabilityImageInput)
	}
	for _, command := range state.availableCommands {
		if strings.EqualFold(strings.TrimSpace(command.Name), "compact") {
			capabilities = append(capabilities, CapabilityCompact)
			break
		}
	}
	return capabilities
}
```

（`capabilities.go` 需要 `import "strings"`。）

- [x] **Step 4: 在 SessionState 中上報**

在 `standard_acp_adapter.go` 的 `SessionState` 中，緊鄰 `snapshot.RuntimeContext["usage"]` 上報處（約 :1282），插入：

```go
if capabilities := standardACPCapabilities(a.config.provider, promptImage, state); len(capabilities) > 0 {
	snapshot.RuntimeContext["capabilities"] = capabilities
}
```

`promptImage` 取該函數中已用於 `promptCapabilities` 上報的同一布爾值（讀該函數體找到現有變量名並沿用；若該處用的是函數調用而非局部變量，提取為局部變量複用，禁止語義漂移）。

- [x] **Step 5: 補 SessionState 集成斷言**

在 `capabilities_test.go` 追加（fake transport 模式參考 `standard_acp_adapter_test.go` 中現有 SessionState 測試，找到一個既有的 claude SessionState 測試並在其斷言後追加，或新寫一個最小用例）：

```go
// 斷言 claude 會話的 SessionState().RuntimeContext["capabilities"] 包含 planMode 與 interrupt。
```

具體寫法：複用該測試文件中既有的「啟動 claude fake 會話 → 取 SessionState」的最短路徑（grep `SessionState(` in standard_acp_adapter_test.go,模仿其 setup）。斷言：

```go
capabilities, _ := snapshot.RuntimeContext["capabilities"].([]string)
if !containsString(capabilities, CapabilityPlanMode) || !containsString(capabilities, CapabilityInterrupt) {
	t.Fatalf("claude session capabilities = %v", capabilities)
}
```

- [x] **Step 6: 跑包內全量測試**

Run: `go test ./runtime/ -count=1`
Expected: 全 PASS

- [x] **Step 7: Commit**

```bash
git add packages/agent/daemon/runtime/
git commit -m "feat(agent): standard ACP adapters report runtime capabilities"
```

### Task 3: nextopd 靜態預設 capabilities

**Files:**

- Modify: `services/nextopd/service/agent/composer_options.go`（`GetComposerOptions` runtimeContext 構造處 :101-107、`composerPromptCapabilities` :128 下方追加）
- Test: `services/nextopd/service/agent/composer_options_test.go`（若不存在則新建；先 `ls services/nextopd/service/agent/*_test.go` 確認）

- [ ] **Step 1: 寫失敗測試**

```go
func TestComposerProviderCapabilitiesDefaults(t *testing.T) {
	t.Parallel()
	claude := composerProviderCapabilities("claude-code")
	for _, want := range []string{"imageInput", "skills", "compact", "tokenUsage", "rateLimits", "planMode", "interrupt"} {
		if !slices.Contains(claude, want) {
			t.Fatalf("claude defaults = %v, missing %q", claude, want)
		}
	}
	codex := composerProviderCapabilities("codex")
	if slices.Contains(codex, "planMode") {
		t.Fatalf("codex defaults must not include planMode: %v", codex)
	}
	if !slices.Contains(codex, "compact") || !slices.Contains(codex, "skills") {
		t.Fatalf("codex defaults = %v", codex)
	}
	if got := composerProviderCapabilities("gemini"); len(got) != 1 || got[0] != "interrupt" {
		t.Fatalf("gemini defaults = %v, want [interrupt]", got)
	}
	if got := composerProviderCapabilities("unknown"); got != nil {
		t.Fatalf("unknown provider defaults = %v, want nil", got)
	}
}
```

（import `slices`；包名與測試風格先看同目錄既有 `*_test.go`。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd services/nextopd && go test ./service/agent/ -run TestComposerProviderCapabilitiesDefaults -count=1`
Expected: FAIL（undefined）

- [ ] **Step 3: 實現靜態預設表並接入 runtimeContext**

`composer_options.go` 追加（緊鄰 `composerPromptCapabilities`）：

```go
// composerProviderCapabilities is the conservative static default used to
// render the composer before a session exists. Once a session is live the
// adapter-reported runtimeContext.capabilities takes precedence (GUI-side
// resolution). Keys mirror packages/agent/daemon/runtime/capabilities.go.
func composerProviderCapabilities(provider string) []string {
	switch agentprovider.Normalize(provider) {
	case agentprovider.ClaudeCode:
		return []string{"imageInput", "skills", "compact", "tokenUsage", "rateLimits", "planMode", "interrupt"}
	case agentprovider.Codex:
		return []string{"imageInput", "skills", "compact", "tokenUsage", "rateLimits", "interrupt"}
	case agentprovider.Gemini, agentprovider.Hermes, agentprovider.Nexight:
		return []string{"interrupt"}
	default:
		return nil
	}
}
```

（`agentprovider` 常量名以該文件內既有 switch 為準——`composerPromptCapabilities` :128 已展示 `agentprovider.ClaudeCode, agentprovider.Codex` 寫法；Gemini/Hermes/Nexight 常量名先 grep `package agentprovider` 確認，不存在的不要編造,改用字符串比較與該包 Normalize 的返回值。）

`GetComposerOptions` 的 runtimeContext 構造（:101-107）追加一行：

```go
"capabilities": composerProviderCapabilities(provider),
```

- [ ] **Step 4: 跑包內測試**

Run: `go test ./service/agent/ -count=1`
Expected: 全 PASS（若有既有測試斷言 runtimeContext 的完整 key 集合，同步加入 `capabilities`）

- [ ] **Step 5: Commit**

```bash
git add services/nextopd/service/agent/
git commit -m "feat(nextopd): static capability defaults in composer options"
```

### Task 4: activity-core `resolveAgentActivityCapability`

**Files:**

- Create: `packages/agent/activity-core/src/capabilities.ts`
- Modify: `packages/agent/activity-core/src/selectors.ts`（複用其 `recordValue` 輔助；若不可導出則在新文件重新實現局部版本）
- Modify: `packages/agent/activity-core/src/index.ts`（或該包的導出入口，先 grep `resolveAgentActivityPromptImagesSupported` 的導出位置照做）
- Test: `packages/agent/activity-core/src/capabilities.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_CAPABILITY_KEYS,
  resolveAgentActivityCapability
} from "./capabilities.ts";

test("runtime capabilities take precedence over composer options", () => {
  assert.equal(
    resolveAgentActivityCapability("compact", {
      sessionRuntimeContext: { capabilities: ["interrupt"] },
      composerOptions: { runtimeContext: { capabilities: ["compact"] } }
    }),
    false
  );
  assert.equal(
    resolveAgentActivityCapability("compact", {
      sessionRuntimeContext: { capabilities: ["compact"] }
    }),
    true
  );
});

test("falls back to composer options when session has no capability list", () => {
  assert.equal(
    resolveAgentActivityCapability("skills", {
      sessionRuntimeContext: {},
      composerOptions: { runtimeContext: { capabilities: ["skills"] } }
    }),
    true
  );
});

test("returns null when no capability data exists", () => {
  assert.equal(resolveAgentActivityCapability("compact", {}), null);
});

test("imageInput falls back to legacy promptCapabilities", () => {
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      sessionRuntimeContext: { promptCapabilities: { image: true } }
    }),
    true
  );
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      composerOptions: {
        runtimeContext: { promptCapabilities: { image: false } }
      }
    }),
    false
  );
});

test("vocabulary matches the Go side", () => {
  assert.deepEqual([...AGENT_CAPABILITY_KEYS].sort(), [
    "compact",
    "imageInput",
    "interrupt",
    "planMode",
    "rateLimits",
    "skills",
    "tokenUsage"
  ]);
});
```

（`composerOptions` 字面量若類型不滿足 `AgentActivityComposerOptions`，按該類型補必填字段或用 `as` 收窄——以現有 selectors.test.ts 的寫法為準。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd packages/agent/activity-core && node --test --experimental-strip-types ./src/capabilities.test.ts`
Expected: FAIL（模塊不存在）

- [ ] **Step 3: 實現 capabilities.ts**

```ts
import type { AgentActivityComposerOptions } from "./types.ts";
import { resolveAgentActivityPromptImagesSupported } from "./selectors.ts";

/** Mirror of packages/agent/daemon/runtime/capabilities.go. */
export const AGENT_CAPABILITY_KEYS = [
  "imageInput",
  "skills",
  "compact",
  "tokenUsage",
  "rateLimits",
  "planMode",
  "interrupt"
] as const;

export type AgentCapabilityKey = (typeof AGENT_CAPABILITY_KEYS)[number];

export interface AgentActivityCapabilityInput {
  composerOptions?: AgentActivityComposerOptions | null;
  sessionRuntimeContext?: Record<string, unknown> | null;
}

export function resolveAgentActivityCapability(
  key: AgentCapabilityKey,
  input: AgentActivityCapabilityInput
): boolean | null {
  const resolved =
    capabilityFromRuntimeContext(key, input.sessionRuntimeContext) ??
    capabilityFromRuntimeContext(key, input.composerOptions?.runtimeContext);
  if (resolved !== null) {
    return resolved;
  }
  if (key === "imageInput") {
    return resolveAgentActivityPromptImagesSupported(input);
  }
  return null;
}

function capabilityFromRuntimeContext(
  key: string,
  runtimeContext: Record<string, unknown> | null | undefined
): boolean | null {
  const list = runtimeContext?.capabilities;
  if (!Array.isArray(list)) {
    return null;
  }
  return list.some((entry) => typeof entry === "string" && entry === key);
}
```

並在包導出入口補導出（與 `resolveAgentActivityPromptImagesSupported` 同處）。

- [ ] **Step 4: 跑包測試**

Run: `cd packages/agent/activity-core && pnpm test`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/activity-core/src/
git commit -m "feat(activity-core): capability resolution selector with static fallback"
```

### Task 5: compact 能力門控接入 slash 命令策略

**Files:**

- Modify: `packages/agent/gui/agent-gui/agentGuiNode/model/agentSlashCommandProviderPolicy.ts`（`resolveSlashCommandsForProvider` :59-79、`filterUnavailableSlashCommands`）
- Modify: 其調用方（先 `grep -rn "resolveSlashCommandsForProvider(" packages/agent/gui apps/desktop --include="*.ts*" | grep -v test` 找到全部調用點,傳入新參數）
- Test: `packages/agent/gui/agent-gui/agentGuiNode/model/agentSlashCommandProviderPolicy.test.ts`（新建,vitest）

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it } from "vitest";
import { resolveSlashCommandsForProvider } from "./agentSlashCommandProviderPolicy.ts";

describe("compact capability gating", () => {
  it("keeps compact when capability is unknown (legacy behavior)", () => {
    const commands = resolveSlashCommandsForProvider({
      provider: "codex",
      commands: [{ name: "compact" }, { name: "status" }]
    });
    expect(commands.some((command) => command.name === "compact")).toBe(true);
  });

  it("keeps compact when capability resolves true", () => {
    const commands = resolveSlashCommandsForProvider({
      provider: "codex",
      commands: [{ name: "compact" }],
      compactSupported: true
    });
    expect(commands.some((command) => command.name === "compact")).toBe(true);
  });

  it("drops compact (including fallback) when capability resolves false", () => {
    const commands = resolveSlashCommandsForProvider({
      provider: "codex",
      commands: [{ name: "compact" }, { name: "status" }],
      compactSupported: false
    });
    expect(commands.some((command) => command.name === "compact")).toBe(false);
    expect(commands.some((command) => command.name === "status")).toBe(true);
  });
});
```

（`AgentSessionCommand` 字面量若有必填字段,按類型補齊。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd packages/agent/gui && pnpm vitest run agentGuiNode/model/agentSlashCommandProviderPolicy.test.ts`
Expected: FAIL（unknown property `compactSupported` / 行為不符）

- [ ] **Step 3: 實現門控**

`resolveSlashCommandsForProvider` 簽名增加可選 `compactSupported?: boolean | null`（默認 undefined=未知=保持現狀），傳入 `filterUnavailableSlashCommands` 的 options；在該過濾器現有 `commandName === "compact"` 分支（:217 附近）改為：

```ts
if (commandName === "compact") {
  if (compactSupported === false) {
    return false;
  }
  return input.hasCompactableContext;
}
```

- [ ] **Step 4: 調用方接線**

對 grep 到的每個調用點:從該處可得的會話運行時上下文與 composer options 構造:

```ts
compactSupported: resolveAgentActivityCapability("compact", {
  sessionRuntimeContext,
  composerOptions
});
```

若調用點拿不到這兩者（純展示路徑），傳 `undefined` 保持現狀並在代碼處留一行註釋說明數據不可達。

- [ ] **Step 5: 跑 gui 包測試 + typecheck**

Run: `cd packages/agent/gui && pnpm vitest run && pnpm exec tsc --noEmit -p .`（tsc 命令以該包 package.json 的 typecheck script 為準,有則用 script）
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent/gui/
git commit -m "feat(agent-gui): gate compact slash command on negotiated capability"
```

### Task 6: 全量驗證與收尾

- [ ] **Step 1: Go 全量**

Run: `cd packages/agent/daemon && go test ./... -count=1 && cd ../../../services/nextopd && go test ./... -count=1`
Expected: 全 PASS（nextopd 的 agentstatus claude auth 測試有既知並行 flake,失敗則單獨重跑確認）

- [ ] **Step 2: lint**

Run: `export PATH="$HOME/go/bin:$PATH" && pnpm lint:go && pnpm lint:ts 2>&1 | tail -5`
Expected: 0 issues / 無 error

- [ ] **Step 3: TS 受影響包測試**

Run: `cd packages/agent/activity-core && pnpm test && cd ../gui && pnpm vitest run`
Expected: 全 PASS

- [ ] **Step 4: Commit（若有殘餘變更）並記錄分支狀態**

```bash
git status -s && git log --oneline codex-app-server..HEAD
```

Expected: 乾淨工作區,5 個左右 commit。
