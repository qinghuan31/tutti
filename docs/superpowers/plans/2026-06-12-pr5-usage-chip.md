# PR5 常駐用量指示器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 會話詳情標題欄常駐 usage chip（context 佔用百分比），hover 展開 token 明細與限流配額；數據缺失時整體隱藏。

**Architecture:** activity-core 新增 `resolveAgentActivityUsage`（供本 PR 與 PR3 閾值提醒共用）；GUI 在 `AgentGUIDetailHeader`（`AgentGUINodeView.tsx:1730`）渲染 chip，數據經 viewModel 從 `sessionChrome.rawState.runtimeContext.usage` 派生（該數據已在 turn 中實時推送，見 spec §3.3）。

**Tech Stack:** TypeScript（activity-core node:test；agent-gui vitest）。

**分支:** `capability-negotiation`。

---

### Task A: activity-core usage selector

**Files:**

- Modify: `packages/agent/activity-core/src/capabilities.ts`（同文件追加,或新建 `usage.ts`——以包內文件粒度慣例為準）
- Modify: 包導出入口
- Test: `packages/agent/activity-core/src/usage.test.ts`

- [x] **Step 1: 寫失敗測試**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAgentActivityUsage } from "./usage.ts";

test("resolves context window usage with percent", () => {
  const usage = resolveAgentActivityUsage({
    sessionRuntimeContext: {
      usage: {
        contextWindow: { usedTokens: 50_000, totalTokens: 200_000 },
        quotas: [{ quotaType: "session", percentRemaining: 75 }]
      }
    }
  });
  assert.deepEqual(usage, {
    usedTokens: 50_000,
    totalTokens: 200_000,
    percentUsed: 25,
    quotas: [{ quotaType: "session", percentRemaining: 75 }]
  });
});

test("returns null without usable context window", () => {
  assert.equal(resolveAgentActivityUsage({}), null);
  assert.equal(
    resolveAgentActivityUsage({
      sessionRuntimeContext: {
        usage: { contextWindow: { usedTokens: 1, totalTokens: 0 } }
      }
    }),
    null
  );
});

test("quotas-only usage still resolves with null percent", () => {
  const usage = resolveAgentActivityUsage({
    sessionRuntimeContext: {
      usage: { quotas: [{ quotaType: "weekly", percentRemaining: 90 }] }
    }
  });
  assert.equal(usage?.percentUsed, null);
  assert.equal(usage?.quotas.length, 1);
});
```

- [x] **Step 2: 確認失敗** → Run: `cd packages/agent/activity-core && pnpm test`
- [x] **Step 3: 實現**

```ts
export interface AgentActivityUsage {
  usedTokens: number | null;
  totalTokens: number | null;
  percentUsed: number | null; // 0-100, rounded to integer; null when window unknown
  quotas: Array<Record<string, unknown>>;
}

export interface AgentActivityUsageInput {
  sessionRuntimeContext?: Record<string, unknown> | null;
}

export function resolveAgentActivityUsage(
  input: AgentActivityUsageInput
): AgentActivityUsage | null {
  const usage = recordValue(input.sessionRuntimeContext?.usage);
  if (!usage) {
    return null;
  }
  const contextWindow = recordValue(usage.contextWindow);
  const usedTokens = finiteNumber(contextWindow?.usedTokens);
  const totalTokens = finiteNumber(contextWindow?.totalTokens);
  const quotas = Array.isArray(usage.quotas)
    ? usage.quotas.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null
      )
    : [];
  const hasWindow =
    usedTokens !== null && totalTokens !== null && totalTokens > 0;
  if (!hasWindow && quotas.length === 0) {
    return null;
  }
  return {
    usedTokens: hasWindow ? usedTokens : null,
    totalTokens: hasWindow ? totalTokens : null,
    percentUsed: hasWindow
      ? Math.min(100, Math.round((usedTokens / totalTokens) * 100))
      : null,
    quotas
  };
}
```

（`recordValue`/`finiteNumber` 輔助:若 selectors.ts 已有可導出的就複用,否則本地實現:`recordValue(v)` 返回 object 非 null 的 Record 或 null;`finiteNumber(v)` 接受 number 且 isFinite,否則 null。）

- [x] **Step 4: 通過 + 全包測試 + typecheck** → `pnpm test && pnpm typecheck`
- [x] **Step 5: Commit** `feat(activity-core): shared usage selector`

### Task B: 標題欄 usage chip

**Files:**

- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts`（viewModel 增加 `usage: AgentActivityUsage | null`,由 `resolveAgentActivityUsage({ sessionRuntimeContext: activeSessionState?.runtimeContext })` 派生,useMemo 依賴對齊——參考 Task 5 已落地的 `compactSupported` 寫法）
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/model/agentGuiNodeTypes.ts`（viewModel 類型）
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINodeView.tsx`（`AgentGUIDetailHeader` props 增加 usage 與 labels;在 `detailHeaderStatus`（:1769）旁渲染 chip）
- Modify: i18n（`agentHost.agentGui.*` 既有命名空間,參考 :686 的 slashStatus 鍵位置補:usageChipLabel「上下文 {percent}%」、popover 標題、tokens 明細、限流標籤——三語）
- Test: 既有 layout/spec fixtures 補 `usage: null`;新增 vitest 渲染斷言（有 usage 顯示 chip、null 隱藏）

**Chip 要求:**

- 顯示 `{percentUsed}%`（percentUsed 為 null 但有 quotas 時不顯示 chip——本期 chip 只表達 context 佔用）;>=80% 加警示色 class（沿用既有狀態色 token,grep styles 文件的 warning/danger 變量）,>=95% 危險色——該視覺檔位與 PR3 閾值常量共用:常量定義放 `model/agentUsageThresholds.ts`（`export const USAGE_WARN_PERCENT = 80; export const USAGE_CRITICAL_PERCENT = 95;`）。
- hover/click 彈出明細:usedTokens/totalTokens（千分位格式化,沿用 slashStatus 的格式化函數,grep `slashStatusContextText`）+ quotas 列表（percentRemaining + 重置時間,格式化邏輯參考 `slashStatusLimitsFromQuotas` :187）。彈層組件沿用該包既有 popover/tooltip 慣例（先 grep）。
- 數據為 null → 不渲染任何節點。

- [ ] **Step 1: 寫失敗的渲染測試**（vitest,渲染 AgentGUINodeView 或直接渲染 AgentGUIDetailHeader——以既有 spec 的測試對象為準）
- [ ] **Step 2: 確認失敗**
- [ ] **Step 3: 實現（controller → types → view → i18n → thresholds 常量）**
- [ ] **Step 4: `cd packages/agent/gui && pnpm vitest run && pnpm typecheck` + `pnpm check:i18n`**
- [ ] **Step 5: Commit** `feat(agent-gui): persistent context usage chip in session header`

### Task C: 收尾

- [ ] **Step 1:** gui + activity-core 全測試重跑,無回歸。
