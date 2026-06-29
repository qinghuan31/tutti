# 2026-06-29 Feishu Bug Records

## EbVfrVlvYelOPBc6OMUcjiSTnZb - task run latest status opens missing session

- Link: https://ccn53rwonxso.feishu.cn/record/EbVfrVlvYelOPBc6OMUcjiSTnZb
- Base record id: `recvnVhs7OCDlc`
- Bug: 任务中心的最新执行状态关联不对，点击打开会话显示会话不存在，但实际会话存在。
- Evidence: Feishu attachments show task `新建ppt和文档` failed in Task Center, while clicking the latest execution status opens a toast saying the Agent session no longer exists. The attached log bundle contains the real Claude Code session `737f3449-4a14-422f-92fe-2ee04534877c` for `请处理这个任务引用。 @新建ppt和文档` and a related Codex session `8f933226-c3cd-493c-82b4-299fffd4a5ed`.
- Cause: The latest execution status was bound before the real AgentGUI session boundary. A first local fix tried to preserve an issue-manager-generated `agentSessionId` through the draft-launch path, but that put ownership in the wrong layer: issue-manager should not generate or bind AgentGUI session ids. The durable binding belongs to the agent runtime when it creates the issue run.
- Fix: Removed issue-manager UI-side `agentSessionId` generation and draft-launch session binding. Issue-manager now only opens the AgentGUI draft. `issue run create` and `issue task run create` default `agent-session-id` from the current AgentGUI invoke context, while keeping the explicit CLI flag only as a manual fallback. Agent sidecar skill templates and generated command guides were updated to stop teaching agents to pass a session id during normal AgentGUI execution.
- Verification:
  - `corepack pnpm --filter @tutti-os/agent-gui exec vitest run --environment jsdom workbench/launch.test.ts`
  - `corepack pnpm --filter @tutti-os/desktop test -- src/renderer/src/features/workspace-agent/services/desktopAgentGUIPrefillPromptActivation.test.ts src/renderer/src/features/workspace-issue-manager/internal/adapters/desktopIssueManagerAgentRunner.test.ts src/renderer/src/features/workspace-workbench/services/internal/workspaceWorkbenchComposition.test.ts`
  - `corepack pnpm --filter @tutti-os/workspace-issue-manager test -- --test-name-pattern "run selected task|run selected issues|honor provider overrides"`
  - `go test ./services/tuttid/service/cli/providers/issuemanager ./services/tuttid/service/agentsidecar`
  - `corepack pnpm --filter @tutti-os/agent-gui typecheck`
  - `corepack pnpm --filter @tutti-os/desktop typecheck`
  - `corepack pnpm --filter @tutti-os/workspace-issue-manager typecheck`
- Status: fixed locally
- Commits: `fab699c7d` introduced the initial UI-side preservation approach and is superseded by `87fbb90ea`, which moves run/session binding to the agent runtime context. Documentation was first recorded in `4080d4a05`.
- Feishu status update: confirmed `修复中`.
